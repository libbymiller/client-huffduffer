var express  = require('express'),
    request = require('request'),
    cheerio = require('cheerio'),
    mustacheExpress = require('mustache-express'),
    bodyParser = require('body-parser'),
    app      = express(),
    radiodanClient = require('radiodan-client'),
    radiodan = radiodanClient.create(),
    player   = radiodan.player.get('main'),
    eventBus       = require('./lib/event-bus').create(),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    eventSource = require('express-eventsource'),
    port     = process.env.PORT || 5000;


app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/static');

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/radiodan', radiodanClient.middleware({crossOrigin: true}));

//stuff
bindToEventBus(player,eventBus);

var playlist = readConfig('config/playlist.json');
var config = readConfig('config/config.json');
var currentFeedUrl = null;

console.log("playlist is");
console.log(playlist);
console.log("config is");
console.log(config);

// server

// get rss shows the current url, if any
// and allows you to set it using a POST

app.get('/rss', function (req, res) {
  res.render('config', {});
// { feedUrl: config.feedUrl });
});

app.post('/rss', function (req, res) {
  if (req.body && req.body.feedUrl) {
     addFeedURL(req.body.feedUrl, req,res);
  }

  res.redirect('/');
});

// rssFromNFC allows a post (e.g from NFC) to set the RSS feed url
app.post('/rssFromNFC', function (req, res) {
  stopPlaying();
  if (req.body && req.body.feedUrl) {

     showPowerLed([100,100,0]);
     addFeedURL(req.body.feedUrl);
  }


  res.redirect('/');
});


// stop playing (e.g. from NFC trigger)

app.post('/stopFromNFC', function (req, res) {
  var st = player;
  console.log("status %j", st);
  stopPlaying();
  showPowerLed([0,0,100]);
  res.redirect('/');
});


// "write" a card
// actually just adds a card id and url to a list
// screen 1: ask people to put the card in the box

app.get('/write', function (req, res) {
  res.render('write');
});


// screen 2: test the card for suitability and feed back information about it

app.get('/write2', function (req, res) {

  var msg = "";
  //load the file
  var fullPath = __dirname;
  var fullFile = path.join(fullPath,"config/uid.json");
  if ( fs.existsSync(fullFile) ) {
    var data = require(fullFile);
    if(data){
      var feedUrl = data["feedUrl"] | "";
      var uid = data["uid"] | "";
      if(uid == ""){
        msg = "No card available to read";
      }else if (feedUrl==""){
        msg = "Card "+uid+" ready to associate with a feed"
      }else if (feedUrl!=""){
        msg = "Card "+uid+" already exists in the database - currently linked to "+feedUrl+" - proceeding will link it to another feed";
      }else{
        msg = "Something went wrong";
      }
    }else{
       msg = "No data found in "+fullFile;
    }
  }else{
    msg = "No uid.json file found at "+fullFile;
  }
  res.render('write2', { feedUrl: req.body.feedUrl, msg: msg });

});

// screen 3: check the feed has enclosures

app.post('/write3', function (req, res) {
    request(req.body.feedUrl,function(err, data){
      var urlOk = "Contains audio links";
      if (err) {
        console.error('Error fetching feed');
        console.error(err.stack);
        urlOk = "problem with the feed url - check it doesn't have a typo - "+req.body.feedUrl;
        res.render('write3err', { feedUrl: req.body.feedUrl, urlOk: urlOk });
      }else{

        var doc = cheerio(data.body);
        var urls = doc.find('enclosure')
                .map(extractUrlFromEnclosure)
                .get();
    
        if(urls!=null && urls.length>0){
           urlOk = "Found "+urls.length+" audio files in the RSS feed - all ok";
           res.render('write3', { feedUrl: req.body.feedUrl, urlOk: urlOk });
        }else{
          urlOk = "No playable audio files found in the RSS feed, though it does exist";
          res.render('write3err', { feedUrl: req.body.feedUrl, urlOk: urlOk });
        }
      }
    });
});


//write4: write the ID to the database and display results

app.post('/write4', function (req, res) {

  var feedUrl = req.body.feedUrl;

  // read the data file
  var fullPath = __dirname;
  var fullDataFile = path.join(fullPath,"config/data.json");
  var fullUidFile = path.join(fullPath,"config/uid.json");
  var uid_data = null;
  var data = null;
  var msg = "";

  if ( fs.existsSync(fullUidFile) ) {
    uid_data = require(fullUidFile);
  }else{
    console.log("no uid");
    msg = "can't complete - no uid found";
  }

  if ( fs.existsSync(fullDataFile) ) {
    data = require(fullDataFile);
  }else{
    msg = "no data file found - continuing";
    data = {};
  }
  if(uid_data && data){
   var uid = uid_data["uid"];
   if(data[uid]){
     msg = "Replaced "+data[uid]+" for "+uid+" with "+feedUrl;
   }else{
     msg = "New id "+uid+" contains "+feedUrl;
   }
   data[uid] = feedUrl;
   var j = JSON.stringify(data, null, 4)
   fs.writeFile(fullDataFile, j, function (err3) {
        if (err3) throw err3;
        console.log("saved");
   });

   addFeedURL(feedUrl);
  }else{
   console.log("all went wrong somewhere");
  } 
  res.render('write4', { feedUrl: feedUrl, cardId: uid, msg: msg });

});


app.listen(port);
listenToEvents();

showPowerLed([0,0,200]);

var powerButton = radiodan.button.get("power");
powerButton.on("press", stopPlaying);
powerButton.on("release", startPlaying);

//console.log('Reading feedUrl', config.feedUrl);
//request(config.feedUrl,getRSSAndAddToPlaylist);

process.on('SIGTERM', gracefulExit);
process.on('SIGINT' , gracefulExit);

app.use(express.static(__dirname + '/static'));

console.log('Listening on port '+port);


///various handy methods


function showPowerLed(arr){
   var powerLED      = radiodan.RGBLED.get('power');
   powerLED.emit({
     emit: true,
     colour: arr,
   });
}


function addFeedURL(feedUrl){
  var exists = config[feedUrl];
  currentFeedUrl = feedUrl;
  if(exists){
    var toPlay = exists["lastPlayed"];
    var toSeekTo = exists["toSeekTo"];
    console.log("found feed "+toPlay+" "+toSeekTo);

    player.add({
      playlist: [toPlay],
      clear: true
    }).then(player.play()).then(player.seek({"time":toSeekTo}));
//////???? libby .then(getAndFilterRSS(feedUrl,toPlay));

  }else{
    console.log("feed doesn't exist - starting afresh");
    config[feedUrl] = {};
    writeConfig('config/config.json', config);
    request(feedUrl,getRSSAndAddToPlaylist);
  }

/*
  config.feedUrl = feedUrl;
  config = readConfig('config/config.json',null);
  console.log("new config");
  console.log(config);
*/
}


function extractUrlFromEnclosure(index, item) {
  return cheerio(item).attr('url');
}

function startPlaying(){
  console.log("starting playing");
  player.play();
}

function stopPlaying() {
  console.log("stopping playing");
  player.pause({ value: true });
}


function getAndFilterRSS(feedUrl,toPlay){
  // remove the one we are already listening to
  // not sure about the ordering here
  request(feedUrl,function(err, data){
   
    var doc = cheerio(data.body);
    var urls = doc.find('enclosure')
                .map(extractUrlFromEnclosure)
                .get();
    var new_urls = [];
    console.log(urls);
    for(var x in urls){
       if(toPlay!=urls[x]){
         new_urls.push(urls[x]);
       }
    } 
    player.add({
      playlist: new_urls,
      clear: false
    });
//.then(showPowerLed([0,0,100]));

  });  
}


function getRSSAndAddToPlaylist(err, data) {
  if (err) {
    console.error('Error fetching feed');
    console.error(err.stack);
    return;
  }


  var doc = cheerio(data.body);
  var urls = doc.find('enclosure')
                .map(extractUrlFromEnclosure)
                .get();
  player.add({
    playlist: urls,
    clear: true
  });
//.then(startPlaying()).then(showPowerLed([0,0,100]));
  
}


function gracefulExit() {
  console.log('Exiting...');
  player.clear().then(process.exit);
}

function readConfig(file) {
  console.log("path is "+file);
  console.log("fs exists "+fs.existsSync(file)+" process "+process.env.HOME);
  var fullPath = __dirname;
  var fullFile = path.join(fullPath,file);
  console.log(fs.existsSync(fullFile));
  if ( fs.existsSync(fullFile) ) {
    try{
      return require(fullFile);
    }catch(e){
      console.log("problem "+e);
      return {};
    }
  }else{
    console.log("No config file");
    return {};
  }
}

function writeConfig(file, config) {

  var fullPath = __dirname;
  var fullFile = path.join(fullPath,file);
  console.log("writing config path "+fullFile+" config "+JSON.stringify(config));
  try{
    fs.writeFileSync(fullFile, JSON.stringify(config));
  }catch(e){
    console.log("problem writing to file "+e);
  }
}


function listenToEvents(){
  var eventStream = eventSource();

  var eventBus = new EventEmitter({ wildcard: true });

  ['*'].forEach(function (topic) {
    eventBus.on(topic, function (args) {
      console.log("topic "+topic);
      console.log("args "+args);
    });
  });

}


function bindToEventBus(player, eventBus){

      player.on('player', function(playerData) {
        var msg = {
          playerId: player.id,
          player: playerData
        };

        eventBus.emit('player', msg);
      });

      player.on('playlist', function(playlistData) {
        var msg = {
          playerId: player.id,
          playlist: playlistData
        };

        eventBus.emit('playlist', msg);
      });

      var pl = null;

      ['*'].forEach(function (topic) {
        eventBus.on(topic, function (args) {
           if(args["playlist"] && args["playlist"].length>0){
             pl = args["playlist"][0];
             if(pl && pl.length > 0){
                writeConfig('config/playlist.json', playlist);               
             }
           }
           if(args["player"]){
             var ply = args["player"];
             console.log(ply);
             var sid = ply["songid"];
             var elapsed = ply["elapsed"];
             var file = pl["file"];
             console.log("player "+file+" elapsed "+elapsed);
             if(file && elapsed){

               config[currentFeedUrl]["lastPlayed"]=file;
               config[currentFeedUrl]["toSeekTo"]=elapsed;
               console.log("saving config");
               writeConfig('config/config.json', config);               
             }

           }

 //          console.log("!!!!!! topic  "+topic);
   //       console.log("!!!!!!args %j ",args);
        });
      });

}
