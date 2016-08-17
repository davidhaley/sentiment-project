"use strict";

// Require the needed modules and create the app variable.
var requirejs = require('requirejs');
const express = require('express');
const unirest = require('unirest');
const fs = require('fs');
const app = express();
const apiConfig = require('./api');
const config = apiConfig.twitterConfig;
const Twitter = require("twitter-node-client").Twitter;
const twitter = new Twitter(config);
var async = require('async');

// Set up the app to serve files in the public folder.
app.use('/public', express.static(__dirname + '/public'));

// Add local variables that can be used in views and throughout the app.
app.locals.title = 'Sentiment';
app.locals.sentimentQueries = [];
app.locals.tweetArray = [];
app.locals.count = 10;

// App will perform any functions here before responding to routes.
// app.all('*', function(req, res, next){
//   next();
// });

app.set('view engine', 'ejs');

app.get('/', function(req, res) {
  res.render('main.ejs');
});

app.post('/tweets', function(req, res) {

  var queryString = "Tesla Model 3";

  function getTweets(callback) {
    var error = function (error, response, body) {
      if (error) {
        // console.log('ERROR [%s]', error);
        console.log(error)
        // callback(error, null);
        return;
      }
    };

    var success = function(data) {

      JSON.parse(data).statuses.forEach(function(tweet) {
        // Create query object for TwinWord.
        var queryObj = {};

        // Make query id and tweet id equivalent to match them in the client.
        queryObj.id = tweet.id_str;

        // Build query for TwinWord API.
        var text = tweet.text;
        var query = text.split(" ").join("+").replace("'","");
        
        // Add API query to query object, to later match with tweet when returned. 
        queryObj.query = query;

        // Add tweet date to query object for line chart on client
        queryObj.tweetDate = tweet.created_at;

        res.app.locals.sentimentQueries.push(queryObj);
        res.app.locals.tweetArray.push(tweet);
        });

      function sortNumber(a,b) {
        return a.id_str - b.id_str;
      }

      res.app.locals.tweetArray = res.app.locals.tweetArray.sort(sortNumber);

      // Respond to the view only once all of the Tweets have been gathered
      // Otherwise, make additional requests to Twitter

      if ((res.app.locals.tweetArray.length + 1) >= res.app.locals.count ) {
        console.log('Tweet Array Length: ' + res.app.locals.tweetArray.length);
        console.log('Count: ' + res.app.locals.count);
        // Show a maximum amount of tweets on the page
        var numberOfTweetsToDisplay = -50;

        // Build response
        var response = res.app.locals.tweetArray.splice(numberOfTweetsToDisplay);

        // Repond to the view
        res.json(response);
      } else {
        console.log('Tweet Array Length: ' + res.app.locals.tweetArray.length);
        console.log('Count: ' + res.app.locals.count);

        // The first request to the twitter API should specify a count.
        // Subsequent requests should utilize max_id and since_id to
        // Make sure duplicate tweets are not obtained.
        // More information can be found here: https://dev.twitter.com/rest/public/timelines

        // Twitter will only return Tweets with IDs LOWER than the value passed for max_id.
        var max_id = res.app.locals.tweetArray[0].id_str;
        
        // Twitter will only return Tweets with IDs HIGHER than the value passed for since_id.
        var since_id = res.app.locals.tweetArray.slice(-1)[0].id_str;

        if ((res.app.locals.tweetArray.length + 100) > res.app.locals.count) {
          res.app.locals.count = res.app.locals.count - res.app.locals.tweetArray.length;
          console.log("New Count: " + res.app.locals.count);
        }

        // Following Twitter API requests
        twitter.getSearch({"q":queryString, "lang":"en", "count": res.app.locals.count, "max_id": max_id}, error, success);
      };
    };

    // Initial Twitter API request
    twitter.getSearch({"q":queryString, "lang":"en", "count": res.app.locals.count}, error, success);
  }
    getTweets();
});

app.get('/sentiment', function(req, res) {

  var apiDomain = "https://twinword-sentiment-analysis.p.mashape.com/analyze/?text="
  var sentimentArray = [];

  function getSentiment(sentimentQueries, callback) {
    async.reflect(async.mapLimit(sentimentQueries, 10, function(queryObj, callback) {
      var query = queryObj.query;
      unirest.get(apiDomain+query)
      .header("X-Mashape-Key", "kWBJRsZrjmmshQnhz4Fta1chiRRxp1rhKxgjsnUGdwGKSkVFbG")
      .header("Accept", "application/json")
      .end(function (result) {
        if (result.status == 200) {
          console.log("Result status 200. Success");
          var response = [queryObj.id, result.body.type, result.status, result.body.score, queryObj.tweetDate, result.body.keywords];
          callback(null, response);
          return;
        } else {
          console.log("Result status is " + result);
          var error = [queryObj.id, result.error]
          callback(error, null);
          return;
        }
      });
    }, function(err, results) {
      res.json(results);
    }));
  }
  getSentiment(res.app.locals.sentimentQueries);
});

app.listen(3000);
console.log('app is listening at localhost:3000');