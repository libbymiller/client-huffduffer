var express  = require('express'),
    fs = require('fs'),
    path = require('path');

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


function setDuration(url){
  var foo = readConfig("foo.json");
  for(var f in foo){
    if(f==url){
      var st = foo[f]["start"]
      var st_t = (new Date).getTime();
      console.log(st_t);
      if(st){
        var secs = Math.floor( (st_t - st)/1000 );
        console.log("diff "+secs);
        foo[f]["duration"] = secs;
        writeConfig("foo.json",foo);
      }
    }
  }
}


function setStart(url){
  var foo = readConfig("foo.json");
  var found = false;
  var st_t = (new Date).getTime();

  for(var f in foo){
    console.log("f is "+f);
    if(f==url){
      found = true;
      foo[f]["start"] = st_t;
      console.log(st_t);
    }
  }
  if(!found){
      console.log("not found");
      foo[url] = {};
      foo[url]["start"] = st_t;
  }
  writeConfig("foo.json",foo);
}

//setDuration("http://example.com/1.mp3");
setStart("http://example.com/2.mp3");
