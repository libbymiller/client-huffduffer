var request = require('request'),
path = require('path'),
fs = require('fs');

  var feedUrl = "https://huffduffer.com/libbymiller/rss";
  var fn = makeRSSName(feedUrl);
  console.log("caching feedurl "+feedUrl+" as "+fn);

  request(feedUrl,function(err, data){
    if (err) throw err;
    var fullPath = __dirname + "/cache";
    var fullFile = path.join(fullPath,fn);
    console.log("writing rss path "+fullFile);
    var exists = fs.existsSync(fullFile);
    var new_urls = getMatches(data.body);
    var new_urls_str = new_urls.join("\n");
    if(exists){
     fs.readFile(fullFile,'utf8', function (old_err, old_data) {
        console.log("hello "+fullFile);
        if (old_err) throw old_err;
        console.log(old_data);
        if(new_urls_str==old_data){
          console.log("data not changed");
        }else{
          console.log("data changed, writing file "+fullFile);
          console.log(new_urls);
          writeFile(fullFile, new_urls_str);
        }
      });      
    }else{
          console.log("no cache, data changed, writing file "+fullFile);
          writeFile(fullFile, new_urls_str);
  
    }
  });


function getMatches(str){
          var results = [];
          var arrMatches = str.match(/<enclosure url=\"(.*?)\"/g);
          console.log(arrMatches);
          for(var a in arrMatches){
             var url_arr = arrMatches[a].match(/<enclosure url=\"(.*?)\"/);
             results.push(url_arr[1]);
          }
   return results;
}

function writeFile(fullFile, data){
    try{
      fs.writeFileSync(fullFile, data);
    }catch(e){
      console.log("problem caching rss file "+e);
    }

}

function makeRSSName(feedUrl){

    var fn = feedUrl.replace(/^https?/,"");
    fn = fn.replace(/\W/g,"");
    return fn;
}



