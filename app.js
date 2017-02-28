var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

// Server index page
app.get("/",function(req,res){
  res.send("Deployed");
});

// Facebook Webhook
// Used for verification
app.get("/webhook",function(req,res){
  if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN){
      console.log("Verified webhook");
      res.status(200).send(req.query["hub.challenge"]);
  }else{
      console.error("Verification failed. The tokens do not match");
      res.sendStatus(403);
  }
});

//All callbacks for Messenger will be POST-ed here
app.post("/webhook",function(req,res){
  //Make sure this is the page subscription
  if(req.body.object == "page"){
    //iterate  over each entry
    //there may be multiple entries if batched
    req.body.entry.forEach(function(entry){
        //iterate over each messaging event
        entry.messaging.forEach(function(event){
            if(event.postback){
                processPostBack(event);
            }
        });
    });

    res.sendStatus(200);
  }
});

function processPostBack(event){
  var senderId = event.sender.id;
  var payload = event.postback.payload;

  if(payload === "Greeting"){
    //Get user's first name from the User Profile api
    // and include it in the greeting
    request({
      url: "https://graph.facebook.com/v2.6/" + senderId,
      qs: {
          access_token: process.env.PAGE_ACCESS_TOKEN,
          fields: "first_name"
      }, function(error, response, body){
          var greeting = "";
          if(error){
              console.log("Error getting user's name: " + error);
          }else{
              var bodyObj = JSON.parse(body);
              name = bodyObj.first_name;
              greeting = "Hi " + name + ".";
          }
          var message = greeting + "My name is Raspa, im a dog bro/a";
          sendMessage(senderId,{text:message});
      }
    });
  }
}

function sendMessage(recipientId, message) {
  request({
    url: "https://graph.facebook.com/v2.6/me/messages",
    qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
    method: "POST",
    json: {
        recipient: {id: recipientId},
        message: message
    }
  }, function(error, response, body) {
    if(error){
        console.log("Error sending message: " + response.error);
    }
  });
}