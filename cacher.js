var express  = require('express'),
    request = require('request'),
    bodyParser = require('body-parser'),
    fs = require('fs'),
    path = require('path');

//var http = require('http');
var http = require('follow-redirects').http;

// config things
var currentFeedUrl = null;


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
        cacheRSS(feedUrl,bookmarked);
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
    console.log("URL");
    console.log(fn);
    return fn;
}

// complicated method, which
// * gets a feed url
// * compares it with any cached data from that feed url
// * caches anything new

function cacheRSS(feedUrl, bookmarked){

  //make a simplified name from the feedUrl
  
  var fn = makeRSSName(feedUrl);
  console.log("caching feedurl "+feedUrl+" as "+fn);

  // get the feed data
  request(feedUrl,function(err, data){
    if (err){
       console.log("error in request for "+feedUrl+" err "+err);
    }
    var fullPath = __dirname + "/cache";
    var fullFile = path.join(fullPath,fn);

    // check the cache
    console.log("Looking for cache "+fullFile);
    var exists = fs.existsSync(fullFile);
    console.log(exists +" exists");
    var new_urls = getMatches(data.body);
    var new_urls_str = new_urls.join("\n");

    if(exists){
     // compare old and new data

     fs.readFile(fullFile,'utf8', function (old_err, old_data) {
        //console.log("hello "+fullFile);
        if (old_err) throw old_err;
        if(new_urls_str==old_data){
          console.log("data not changed");
        }else{
          var to_download = arr_diff(old_data.split("\n"), new_urls_str.split("\n"));
          console.log("data changed, writing file ");
          var short_rss = to_download.slice(0,2);
          writeFile(fullFile, short_rss.join("\n"));
          console.log(short_rss);
          for(var i=0; i< short_rss.length; i++){
            var ffn = makeMp3Name(short_rss[i]);
            download(short_rss[i],"/media/music/"+ffn);
          }
        }
      });      
    }else{
          console.log("no cache, data changed, writing file "+fullFile);
          console.log("new urls are");
          var short_rss = new_urls.slice(0,2);
          writeFile(fullFile, short_rss.join("\n"));
          console.log(short_rss);
          for(var i=0; i< short_rss.length; i++){
            var ffn = makeMp3Name(short_rss[i]);
            download(short_rss[i],"/media/music/"+ffn);
          }
    }
  });

}

function arr_diff(a1, a2)
{
  var a=[], diff=[];
  for(var i=0;i<a1.length;i++)
    a[a1[i]]=true;
  for(var i=0;i<a2.length;i++)
    if(a[a2[i]]) delete a[a2[i]];
    else a[a2[i]]=true;
  for(var k in a)
    diff.push(k);
  return diff;
}


function download(url, dest) {
  var file = fs.createWriteStream(dest);
  var request = http.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close();
    });
  });
}


// hack-parse a feed for enclosures
// hack parsed because XML parsing is slow (sorry Andrew!)

function getMatches(str){
   console.log("getting matches");
   //console.log(str);
   var results = [];
   var arrMatches = str.match(/<enclosure url=\"(.*?)\"/g);
   //console.log(arrMatches);
   for(var a in arrMatches){
      var url_arr = arrMatches[a].match(/<enclosure url=\"(.*?)\"/);
      results.push(url_arr[1]);
   }
   return results;
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
  process.exit;
}


if(process.argv[2]){
  console.log(process.argv[2]);
  addFeedURL(process.argv[2]);
}else{
 var fullPath = __dirname;
 var fullFile = path.join(fullPath,"config/data.json");
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

        if(config){
          for(var c in config){
            var url = config[c];
            console.log(url);
            addFeedURL(url);
          }
        }
 });


}

