//dependencies
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var passport = require('passport');
var Strategy = require('passport-http').BasicStrategy;
var user = require('./User.js').User;

var multer = require('multer');

var upload = multer({dest: './app/images'});

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

app.post('/user/image', upload.single('thumbnail'), function (req, res, next) {
    // req.file is the `avatar` file
    // req.body will hold the text fields, if there were any

    console.log("entra!");

    console.log(req.body); // form fields
    console.log(req.file);

    res.sendStatus(204);


});

app.use(bodyParser.urlencoded({ extended: true}));
app.use(bodyParser.json());

//Routes
app.use('/user', require('./routes/user'));
app.use('/friendship', require('./routes/friendship'));
app.use('/images', express.static(__dirname + '/app/images'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/app/index.html');
});

//enable CORS filter
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

const server = app.listen(3000, function(){
    console.log('Listening on port 3000');
});

var io = require('socket.io').listen(server);

io.set('log level', 1);
io.on('connection', require('./websocket')(io.sockets));