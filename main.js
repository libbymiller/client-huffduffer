var express  = require('express'),
    request = require('request'),
    cheerio = require('cheerio'),
    mustacheExpress = require('mustache-express'),
    bodyParser = require('body-parser'),
    app      = express(),
    radiodanClient = require('radiodan-client'),
    radiodan = radiodanClient.create(),
    player   = radiodan.player.get('main'),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    port     = process.env.PORT || 5000;


app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/static');

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/radiodan', radiodanClient.middleware({crossOrigin: true}));

var config = readConfig('config/config.json');

console.log("config is");
console.log(config);

// server

// get rss shows the current url, if any
// and allows you to set it using a POST

app.get('/rss', function (req, res) {
  res.render('config', { feedUrl: config.feedUrl });
});

app.post('/rss', function (req, res) {
  if (req.body && req.body.feedUrl) {
     addFeedURL(req.body.feedUrl, req,res);
  }

  res.redirect('/');
});

// rssFromNFC allos a post to set the RSS feed url

app.post('/rssFromNFC', function (req, res) {
  if (req.body && req.body.feedUrl) {

     var powerLED      = radiodan.RGBLED.get('power');
     powerLED.emit({
      emit: true,
      colour: [100,100,0],
     });
     addFeedURL(req.body.feedUrl);
  }

  res.redirect('/');
});


// "write" a card
// actually just adds a card id and url to a list
// screen 1: 

app.get('/write', function (req, res) {
  res.render('write');
});


// screen 2

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

// screen 3

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


app.post('/write4', function (req, res) {
//write the ID to the database

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

showPowerLed();

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


function showPowerLed(){
     var powerLED      = radiodan.RGBLED.get('power');
     powerLED.emit({
      emit: true,
      colour: [0,0,200],
     });
}

function addFeedURL(feedUrl){
  config.feedUrl = feedUrl;
  writeConfig('config/config.json', config);
  config = readConfig('config/config.json',null);
  console.log("new config");
  console.log(config);
  request(config.feedUrl,getRSSAndAddToPlaylist);

}

function extractUrlFromEnclosure(index, item) {
  return cheerio(item).attr('url');
}

function startPlaying(){
  console.log("powerButton PRESSED");
  player.play();
}

function stopPlaying() {
  console.log("powerButton RELEASED");
  player.pause({ value: true });
}


function getRSSAndAddToPlaylist(err, data) {
  if (err) {
    console.error('Error fetching feed');
    console.error(err.stack);
    return;
  }

  var powerLED      = radiodan.RGBLED.get('power');

  var doc = cheerio(data.body);
  var urls = doc.find('enclosure')
                .map(extractUrlFromEnclosure)
                .get();
  player.add({
    playlist: urls,
    clear: true
  }).then(startPlaying()).then(
     powerLED.emit({
      emit: true,
      colour: [0,0,100],
     })
  );
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
    return require(fullFile);
  }else{
    console.log("No config file");
  }
}

function writeConfig(file, config) {

  var fullPath = __dirname;
  var fullFile = path.join(fullPath,file);
  console.log("writing config path "+file+" config "+JSON.stringify(config));
  try{
    fs.writeFileSync(file, JSON.stringify(config));
  }catch(e){
    console.log("problem writing to file "+e);
  }
}


