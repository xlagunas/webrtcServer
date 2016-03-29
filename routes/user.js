//Dependencies
var express = require('express');
var router = express.Router();
var passport = require('passport');
var user = require('../User').User;
var pushNotification = require('../push-sender');

//login user
router.post('/login', function(req, res){
   user.login(req.body.username, req.body.password, function(callback){

      if (callback.status === "success"){
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
   res.send(req.user);
});

//Delete new user
router.delete('/:id', function(req, res){
   res.send('remove');
});

//get user
router.get('/:username', passport.authenticate('basic', {session: false}), function(req, res){
   console.log(req.user);
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


module.exports = router;