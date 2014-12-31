var express  = require('express'),
    request = require('request'),
    fs = require('fs'),
    path = require('path');

  var feedUrl = "http://example.com";
  var file = "../nfc/uid.txt";
  var db = "../nfc/data.txt";


  fs.readFile(file,'utf8', function (err, data) {
    console.log("hello "+file);
    if (err) throw err;

    console.log("data is "+data);
    var arr = data.split(" ");
    var uid = arr[0];
    var new_list = [];
    if(uid){
      console.log("uid is "+uid);
      fs.readFile(db,'utf8', function (err2, data2) {
          var found = false;
          console.log("data is "+data2);
          if (err2) throw err2;
          var arr2 = data2.split("\n");
          console.log(arr2);
          for(var a in arr2){
            console.log(a);
            var arr3 = arr2[a].split(" ");
console.log("nnnnn "+arr3[0]);
            if(arr3[0]==uid){
console.log("!!!!!!!");
               found = true;
               new_list.push(uid+" "+feedUrl);
            }else{
               if(arr2[a]!=""){
                 new_list.push(arr2[a]);
               }
            }
          }
          if(!found){
            new_list.push(uid+" "+feedUrl);
          }
          fs.writeFile(db, new_list.join("\n"), function (err3) {
            if (err3) throw err3;
            console.log(new_list.join("\n"));
            console.log("saved "+db);
          });
      });
   }

  });

