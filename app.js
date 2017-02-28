var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));
var db = mongoose.connect(process.env.MONGODB_URI);
var Movie = require("./models/movie");

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
            }else if(event.message){
                processMessage(event);
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
        },
        method: "GET" 
      }, function(error, response, body){
          var greeting = "";
          if(error){
              console.log("Error getting user's name: " + error);
          }else{
              var bodyObj = JSON.parse(body);
              greeting = "Hi " + bodyObj.first_name + ".";
          }
          var message = greeting + "My name is Raspa, im a dog bro/a";
          sendMessage(senderId,{text:message});
      });
  }else if(payload === "Correct"){
    sendMessage(senderId,{text: "great bark, now wada you want to know? enter the word extacly 'plot', 'date', 'runtime','director','cast','rating'"});
  }else if(payload === "Incorrect"){
      sendMessage(senderId, {text: "dog, try searching the exact name of der movie bark"});
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

function processMessage(event){
  if(!event.message.is_echo){
    var message = event.message;
    var senderId = event.sender.id;

    console.log("Received message from senderId: "+senderId);
    console.log("Message is: " + JSON.stringify(message));
    
    //You may get a text or attachment but not both
    if(message.text){
    var formattedMsg = message.text.toLowerCase().trim();

    switch(formattedMsg){
      case "plot":
      case "date":
      case "runtime":
      case "director":
      case "cast":
      case "rating":
        getMovieDetail(senderId, formattedMsg);
      break;

      default:
        findMovie(senderId, formattedMsg);
      }
    }else if(message.attachments){
      sendMessage(senderId,{text: "Sorry you put something completly out of context son"});
    }
  }
}

function getMovieDetail(userId, field){
  Movie.findOne({user_id: userId}, function(err, movie) {
    if(err){
        sendMessage(userId, {text: "yo some stuff came up an i can't complete that"});
    } else{
        sendMessage(userId, {text: movie[field]});
    }
  });
}

function findMovie(userId, movieTitle){
  request("http://www.omdbapi.com/?type=movie&t="+movieTitle, function(error,response,body){
    if(!error && response.statusCode === 200){
      var movieObj = JSON.parse(body);
      if(movieObj.Response === "True") {
        var query = {user_id:userId};
        var update = {
          user_id:userId,
          title: movieObj.Title,
          plot: movieObj.Plot,
          date: movieObj.Released,
          runtime: movieObj.Runtime,
          director: movieObj.Director,
          cast: movieObj.Actors,
          rating: movieObj.imdbRating,
          poster_url: movieObj.Poster
        };
        var options = {upsert: true};
        Movie.findOneAndUpdate(query,update,options,function(err, move){
          if(err){
            console.log("Database error: " + err);
          }else {
            message = {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: movieObj.Title,
                    subtitle: "Is this the movie you are looking for?",
                    image_url: movieObj.Poster === "N/A" ? "http://placehold.it/350x150" : movieObj.Poster,
                    buttons:[{
                    type: "postback",
                    title: "rawr",
                    payload: "Correct"
                    }, {
                      type: "postback",
                      title: "bork",
                      payload: "Incorrect"
                    }]
                  }]
                }
              }
            }  
            sendMessage(userId, message);
          }
        });
      }else{
        console.log(movieObj.Error);
        sendMessage(userId, {text: movieObj.Error});
      }
    }else{
      sendMessage(userId, {text: "yo you did something wrong, or like the dude that suppose to fix this didn't fix it"});
    }
  });
}