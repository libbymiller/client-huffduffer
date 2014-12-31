var exec = require('child_process').exec;

  foo = "https://huffduffer.com/libbymiller/rss"
  console.log("command is python /opt/radiodan/apps/nfc/writeCardToDatabase.py "+foo);
  exec('python /opt/radiodan/apps/nfc/writeCardToDatabase.py '+foo, function (error, stdout, stderr) {
    console.log("error is "+error);
    console.log("stderr is "+stderr);
    console.log("stout is "+stdout);
  });
