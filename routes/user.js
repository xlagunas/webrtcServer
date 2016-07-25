//Dependencies
var express = require('express');
var router = express.Router();
var passport = require('passport');


var user = require('../User').User;
var pushNotification = require('../push-sender');

var websocket = require('../websocket');

var multer = require('multer');
var storage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, 'app/images')
   },
   filename: function (req, file, cb) {
      cb(null, req.user.id)
   }
});

var upload = multer({ storage: storage }).single('thumbnail');

router.post('/image', passport.authenticate('basic', {session: false}), function (req, res) {
   upload(req, res, function(error){
      console.log(req.file.destination);
      console.log(req.file.filename);
      if (error){
         res.sendStatus(500);
      } else {
         req.user.updateImage(req.file.filename, function(error, user){
            if (error){
               res.sendStatus(500);
            } else {
               res.send(user);
            }
         });
      }
   });

});

//login user
router.post('/login', function(req, res){
   user.login(req.body.username, req.body.password, function(callback){

      if (callback.status === "success"){
         console.log(req.body.username +"logged");
         res.send(callback.user);
      } else {
         res.sendStatus(400);
      }
   });
});

//Create new user
router.put('/', function(req, res){
   user.create(req.body, function(error, newUser){
      if (error){
         res.sendStatus(500);
         console.log(error);
      } else {
         console.log('User successfully created');
         res.send(newUser);
      }
   });
});

router.get('/profile', passport.authenticate('basic', {session: false}), function(req, res){
   console.log("Hitting profile request");
   res.send(req.user);
});

//Delete new user
router.delete('/:id', function(req, res){
   res.send('remove');
});

//get user
router.get('/:username', passport.authenticate('basic', {session: false}), function(req, res){
   user.findMatchingUsers(req.params.username, function(user){
      res.send(user);
   });
});

router.put('/token',passport.authenticate('basic', {session: false}), function(req, res){
   req.user.uuid.push(req.body.token);
   req.user.save(function(error, user){
      if (error) {
         res.sendStatus(500);
         console.log(error);
      } else {
         console.log("Token stored successfully");
         res.send(user);
      }
   });
});

router.post('/push', passport.authenticate('basic', {session: false}), function(req, res){
   console.log(req.user.uuid[0].token);
   pushNotification.Send(req.user.uuid[0].token, req.user.username);
   res.sendStatus(200);
});


router.post('/call/:id', passport.authenticate('basic', {session: false}), function(req, res){

});


module.exports = router;