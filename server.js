//dependencies
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var passport = require('passport');
var Strategy = require('passport-http').BasicStrategy;
var user = require('./User.js').User;

//MongoDB
mongoose.connect('mongodb://localhost/rest_test');
//Authentication stuff

passport.use(new Strategy(
    function(username, password, cb) {
        user.login(username, password, function(callback){
            if (callback.status === "error"){
                return cb(null, false);
            } else {
                return cb(null, callback.user);
            }
        });
    }));

//Express
var app = express();
app.use(bodyParser.urlencoded({ extended: true}));
app.use(bodyParser.json());

//Routes
app.use('/user', require('./routes/user'));
app.use('/friendship', require('./routes/friendship'));

app.listen(3000);
console.log('Listening on port 3000');