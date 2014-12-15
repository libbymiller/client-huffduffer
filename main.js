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
    port     = process.env.PORT || 5000;

app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/static');

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/radiodan',
  radiodanClient.middleware({crossOrigin: true})
);

var config = readOrCreateConfigWithDefaults(
  './config.json',
  { feedUrl: 'https://huffduffer.com/libbymiller/rss' }
);

console.log("config is");
console.log(config);

app.get('/rss', function (req, res) {
  res.render('config', { feedUrl: config.feedUrl });
});

app.post('/rss', function (req, res) {
  if (req.body && req.body.feedUrl) {
     addFeedURL(req.body.feedUrl, req,res);
  }

  res.redirect('/');
});

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


app.listen(port);

     var powerLED      = radiodan.RGBLED.get('power');
     powerLED.emit({
      emit: true,
      colour: [0,0,200],
     });

function addFeedURL(feedUrl){
  config.feedUrl = feedUrl;
  writeConfig('./config.json', config);
  config = readOrCreateConfigWithDefaults('./config.json',null);
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

var powerButton = radiodan.button.get("power");
powerButton.on("press", stopPlaying);
powerButton.on("release", startPlaying);

console.log('Reading feedUrl', config.feedUrl);
request(config.feedUrl,getRSSAndAddToPlaylist);


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

function readOrCreateConfigWithDefaults(file, defaults) {
  console.log("path is "+file);
  console.log("fs exists "+fs.existsSync(file)+" process "+process.env.HOME);
  var fullPath = __dirname;
  var fullFile = path.join(fullPath,file);
  console.log(fs.existsSync(fullFile));
  if ( fs.existsSync(fullFile) ) {
    return require(file);
  } else {
    writeConfig(fullFile, defaults);
    return defaults;
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

process.on('SIGTERM', gracefulExit);
process.on('SIGINT' , gracefulExit);

app.use(express.static(__dirname + '/static'));

console.log('Listening on port '+port);
