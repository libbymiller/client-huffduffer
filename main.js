var express  = require('express'),
    request = require('request'),
    mustacheExpress = require('mustache-express'),
    bodyParser = require('body-parser'),
    app      = express(),
    radiodanClient = require('radiodan-client'),
    radiodan = radiodanClient.create(),
    player   = radiodan.player.get('main'),
    eventBus       = require('./lib/event-bus').create(),
    fs = require('fs'),
    path = require('path'),
    eventSource = require('express-eventsource'),
    port     = process.env.PORT || 5000,

    colours = {
      black  : [0, 0, 0],
      blue   : [0, 0, 255],
      green  : [0, 255, 0],
      red    : [255, 0, 0],
      white  : [255, 255, 255],
      yellow : [255, 255, 0]
    };

// server things

app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/static');

app.use(bodyParser.urlencoded({ extended: true }));

// initialise radiodan and listen for and emit events

app.use('/radiodan', radiodanClient.middleware({crossOrigin: true}));
bindToEventBus(player,eventBus);

// Listen for updates to the music database
// to make sure that we've loaded any
// audio files in `./audio` before we try
// and play them
player.on('database.update.start', function() { console.log('database.update.start'); });
player.on('database.update.end', function() { console.log('database.update.end'); });
player.on('database.modified', function() { console.log('database.update.modified'); });


// Tell the player to update its database, discovering
// any audio files in the music directory specified in
// the config file.
player.updateDatabase();

// config things
var currentFeedUrl = null;

// server

// get rss allows you to set the rss file via the web 

app.get('/rss', function (req, res) {
  res.render('config', {});
});

// post rss sets the url, via the web only

app.post('/rss', function (req, res) {
  if (req.body && req.body.feedUrl) {
     addFeedURL(req.body.feedUrl, req,res);
  }
  res.redirect('/');
});

// rssFromNFC allows a post (e.g from NFC) to set the RSS feed url

app.post('/rssFromNFC', function (req, res) {
  stopPlaying();
  showPowerLed(colours.white);
  if (req.body && req.body.feedUrl) {
     addFeedURL(req.body.feedUrl);
  }

  res.redirect('/');
});


// stop playing (e.g. from NFC trigger)

app.post('/stopFromNFC', function (req, res) {
  var st = player;
  console.log("status %j", st);
  stopPlaying();
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

     fs.readFile(fullFile,'utf8', function (err, data) {
        if (err){
          msg = "Error getting uid file, probably no card available";
        }
        if(data){
          console.log("data");
          console.log(data);
          var d = JSON.parse(data);

          var feedUrl = d["feedUrl"];
          var uid = d["uid"];
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

        res.render('write2', { feedUrl: req.body.feedUrl, msg: msg });
     });
  }else{
    msg = "No uid.json file found at "+fullFile;
    res.render('write2', { feedUrl: req.body.feedUrl, msg: msg });
  }

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

        var urls = getMatches(data.body);

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


// screen 4: write the ID to the database and display results

app.post('/write4', function (req, res) {

  var newFeedUrl = req.body.feedUrl;

  // read the data file
  var fullPath = __dirname;
  var fullDataFile = path.join(fullPath,"config/data.json");
  var fullUidFile = path.join(fullPath,"config/uid.json");
  var msg = "";

  if ( fs.existsSync(fullUidFile) ) {
     fs.readFile(fullUidFile,'utf8', function (err, uiddata) {
        if (err){ 
          msg = "Error getting uid file, probably no card available";
        } 
        if(uiddata){
          console.log("uiddata");
          console.log(uiddata);
          var d = JSON.parse(uiddata);

          var feedUrl = d["feedUrl"];
          var uid = d["uid"];

          var dd = {};
//          if ( fs.existsSync(fullDataFile) ) {
            fs.readFile(fullDataFile,'utf8', function (err, data) {
               if (err){ 
                 msg = "Error getting data file, continuing";
               } 
               if(data){
                 console.log("data");
                 console.log(data);
                 dd = JSON.parse(data);
               }

               if(dd[uid]){
                 msg = "Replaced "+dd[uid]+" for "+uid+" with "+newFeedUrl;
               }else{
                 msg = "New id "+uid+" contains "+newFeedUrl;
               }
               dd[uid] = newFeedUrl;
               var j = JSON.stringify(dd, null, 4)
               fs.writeFile(fullDataFile, j, function (err3) {
                 if (err3){
                   msg = "saving failed";
                 }
                  console.log("saved");
               });
               stopPlaying();
               addFeedURL(newFeedUrl);
               res.render('write4', { feedUrl: newFeedUrl, cardId: uid, msg: msg });

             });
       }else{
         msg = "No uid file - probably no card vaailable";
         res.render('write4', { feedUrl: newFeedUrl, cardId: "", msg: msg });
       }
     });

  }else{
    console.log("no uid");
    msg = "can't complete - no uid found";
    res.render('write4', { feedUrl: feedUrl, cardId: "", msg: msg });
  }


});


// more server stuff

app.listen(port);


// for reacting to button off / on

var powerButton = radiodan.button.get("power");
powerButton.on("press", stopPlaying);
powerButton.on("release", startPlaying);

process.on('SIGTERM', gracefulExit);
process.on('SIGINT' , gracefulExit);

app.use(express.static(__dirname + '/static'));

console.log('Listening on port '+port);

showPowerLed(colours.blue)


///-----------------///





///various handy methods

// turn the LED on with RGB arr

function showPowerLed(arr){
   var powerLED      = radiodan.RGBLED.get('power');
   powerLED.emit({
     emit: true,
     colour: arr,
   });
}

// check we have a card - don't want it to play otherwise, as it's confusing

function checkNFCPresentAndPlay(){

  var fullPath = __dirname;
  var fullFile = path.join(fullPath,"config/uid.json");
  if ( fs.existsSync(fullFile) ) {
     fs.readFile(fullFile,'utf8', function (err, data) {
        if (err) throw err;
        if(data){
          console.log("data");
          console.log(data);
          var d = JSON.parse(data);
          var feedUrl = d["feedUrl"];
          var uid = d["uid"];
          console.log(feedUrl);
          console.log(uid);
          if(uid == ""){
            console.log("UID is not there");
          }
          if(feedUrl == ""){
            console.log("feedUrl is not there");
          }
          if(uid == "" || feedUrl ==""){
            console.log("uid or feedurl is empty");
            return false;
          }else{
            console.log("ok");
            player.play().then(showPowerLed(colours.green));
            return true;
          }
        }else{
          console.log("no data file");
          return false;
        }
     });
  }else{
    console.log("file doesn't exist "+fullFile);
    return false;
  }  
}

// start and stop playing
// we don't want to play if there's no card
// (sometimes there might be something on the playlist left over)

function startPlaying(){
  console.log("starting playing, checking for NFC first ")
  checkNFCPresentAndPlay();
}


function stopPlaying() {
  console.log("stopping playing");
  showPowerLed(colours.blue);
  player.pause({ value: true });
}


// main add feed url method

function addFeedURL(feedUrl){
 // first load config

 var fullPath = __dirname;
 var fullFile = path.join(fullPath,"config/config.json");
 fs.readFile(fullFile,'utf8', function (err, data) {
        if (err) {
          console.log("no config file, that's ok");
        }
        var config = {};
        if(data){
          console.log("data");
          console.log(data);
          config = JSON.parse(data);
        }
        if(config && config[feedUrl]){
          bookmarked = config[feedUrl];
        }else{
          bookmarked = null;
        }
        currentFeedUrl = feedUrl;
        //cacheRSSAndPlay(feedUrl,bookmarked);
        playFromCache(feedUrl,bookmarked);
 });

}

// make a simple version of the RSS filename to use as a cache

function makeRSSName(feedUrl){

    var fn = feedUrl.replace(/^https?/,"");
    fn = fn.replace(/\W/g,"");
    return fn;
}

function makeMp3Name(feedUrl){
    var fn = feedUrl.replace(/.*\//,"");
    return fn;
}


// complicated method, which
// * gets a feed url
// * compares it with any cached data from that feed url
// * plays what it finds using the following rules (thanks Richard):
// If there is a whole new one
//       play it
// else
//        play from where I stopped in whatever
// when that finishes play the next newer one (irrespective of listenedness)
// or if there is no newer one play the next older one.


function playFromCache(feedUrl, bookmarked){

// Tell the player to update its database, discovering
// any audio files in the music directory specified in
// the config file.
  player.updateDatabase();


  //make a simplified name from the feedUrl
  
  var fn = makeRSSName(feedUrl);
  console.log("caching feedurl "+feedUrl+" as "+fn);

  //check cache exists
  var fullPath = __dirname + "/cache";
  var fullFile = path.join(fullPath,fn);

  // check the cache
  console.log("Looking for cache "+fullFile);
  var exists = fs.existsSync(fullFile);
  console.log(exists +" exists");

  if(exists){
     // compare old and new data

     fs.readFile(fullFile,'utf8', function (err, data) {
        console.log("hello "+fullFile);
        if (err) throw err;
        var new_urls = data.split("\n");
        console.log("NEW URLS");
        console.log(new_urls);
        if(bookmarked){
            var bookmark = bookmarked["lastPlayed"];
            var bookmark_index =  -1;
            if(bookmark){
              bookmark_index = new_urls.indexOf(bookmark);
            }
            var toSeekTo = bookmarked["toSeekTo"];
            if(!toSeekTo){
               toSeekTo = 0
            }
            if(bookmark_index==-1){
               //doesn't contain our cached one, so we put that on the front of the new list. THis shouldn't happen!
///               var toPlay = new_urls.unshift(bookmark);
//               playWithSeek(toPlay, toSeekTo);
               playWithSeek(new_urls, toSeekTo);
            }else{
               //this is more likely - we are either at the start or somewhat through the  list, so we return it and everything after it   
               var toPlay = new_urls.slice(bookmark_index, new_urls.length);
               playWithSeek(toPlay, toSeekTo);
            }
        }else{
            //just return the new list, no starting point or seek exists
            playWithSeek(new_urls, 0);
        }
     });      
  }else{
     console.log("no cache for his, sorry");
  }

}



// Play a playlist (list of mp3s) and seek if we have a seek for the first one

function playWithSeek(playlist, seek){
  console.log(playlist);
  console.log("=====");
//go through playlist, rewriting for cached version
  var cached_urls_playlist = [];
  for(var i=0; i< playlist.length; i++){
     var pl = playlist[i];
     var np = makeMp3Name(pl);
     cached_urls_playlist.push(np);
  }

  console.log(cached_urls_playlist);
  player.add({clear: true, playlist: cached_urls_playlist})
      .then(player.play)
      .then(function() {
        return player.seek({ time: seekTime });
      })
      .then(showPowerLed(colours.green));

}

// hack-parse a feed for enclosures
// hack parsed because XML parsing is slow (sorry Andrew!)

function getMatches(str){
   console.log("getting matches");
   console.log(str);
   var results = [];
   var arrMatches = str.match(/<enclosure url=\"(.*?)\"/g);
   console.log(arrMatches);
   for(var a in arrMatches){
      var url_arr = arrMatches[a].match(/<enclosure url=\"(.*?)\"/);
      results.push(url_arr[1]);
   }
   return results;
}


// handle events, saving config where appropriate

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

      var playlist = null;

      ['*'].forEach(function (topic) {
        eventBus.on(topic, function (args) {
           //console.log(args);
           if(args["playlist"] && args["playlist"].length>0){
             playlist = args["playlist"];
             //console.log("playlist");
             //console.log(playlist);
             //if(playlist && playlist.length > 0){
             //   writeConfig('config/playlist.json', playlist);               
             //}
           }
           if(args["player"]){
             var ply = args["player"];
             //console.log("ply");
             //console.log(ply);
             var error = ply["error"];
             var song_pos = ply["song"];
             if(error && song_pos){
                console.log("error in playback, skipping "+error);
                // not sure about this means of handling errors
                player.remove({"position":song_pos});
                player.play();
             }
             var sid = ply["songid"];
             var elapsed = ply["elapsed"];
             if(playlist && song_pos && playlist[parseInt(song_pos)]){
               var file = playlist[song_pos]["file"];
               console.log("player "+file+" elapsed "+elapsed);
               if(file && elapsed){

                 var fullPath = __dirname;
                 var fullFile = path.join(fullPath,"config/config.json");
                 fs.readFile(fullFile,'utf8', function (err, data) {
                   if (err) {
                     console.log("no config file, that's ok");
                   }
                   var config = {};
                   if(data){
                     console.log("data");
                     console.log(data);
                     config = JSON.parse(data);
                   }

                   if(!config[currentFeedUrl]){
                     config[currentFeedUrl] = {};
                   }
                   config[currentFeedUrl]["lastPlayed"]=file;
                   config[currentFeedUrl]["toSeekTo"]=elapsed;
                   console.log("saving config");
                   writeConfig('config/config.json', config);               
                 });
               }
             }

           }

        });
      });

}



// write a json file

function writeConfig(file, config) {

  var fullPath = __dirname;
  var fullFile = path.join(fullPath,file);
  console.log("writing config path "+fullFile+" config "+JSON.stringify(config));
  writeFile(fullFile, JSON.stringify(config));
}

// write a string to file

function writeFile(fullFile, str){
    try{
      fs.writeFileSync(fullFile, str);
    }catch(e){
      console.log("problem saving file "+fullFile+" error: "+e);
    }

}

// exit

function gracefulExit() {
  console.log('Exiting...');
  showPowerLed(colours.black);
  player.clear().then(process.exit);
}

