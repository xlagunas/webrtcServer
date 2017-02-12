//dependencies
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var passport = require('passport');
var Strategy = require('passport-http').BasicStrategy;
var userManager = require('./managers/UserManager')();

mongoose.Promise = global.Promise;
mongoose.Promise = require('bluebird');

//MongoDB
mongoose.connect('mongodb://localhost/rest_test');
//Authentication stuff

passport.use(new Strategy(
    function(username, password, cb) {
        userManager.login(username, password, function(loggedUser){
            return cb(null, loggedUser);
        }, function(){
            return cb(null, false);
        });
    }));

//Express
var app = express();

app.use(bodyParser.urlencoded({ extended: true}));
app.use(bodyParser.json());

//Routes
app.use('/user', require('./routes/userRest')(userManager, passport));
app.use('/friendship', require('./routes/friendshipRest')(userManager, passport));
app.use('/images', express.static(__dirname + '/app/images'));

app.use('/app', express.static(__dirname + '/app'));

//enable CORS filter
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

const server = app.listen(3000, function(){
    console.log('Listening on port 3000');
});

var io = userManager.startWS(server);
