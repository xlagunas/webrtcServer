//Dependencies
var express = require('express');
var router = express.Router();
var passport = require('passport');
var Strategy = require('passport-http').BasicStrategy;



var userManager;
var user;

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
   userManager.login(req.body.username, req.body.password, function(user){
      console.log(user);
      res.send(user);

   }, function(error){
      res.sendStatus(400);
   });
});

//Create new user
router.put('/', function(req, res){
   userManager.createUser(req.body, function(createdUser){
      res.send(createdUser);
   }, function(error){
      res.sendStatus(500);
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
   userManager.findUsersContaining(req.params.username, function(obtainedUsers){
      res.send(obtainedUsers);
   }, function(err){
      res.send(500);
   });
});

router.put('/token',passport.authenticate('basic', {session: false}), function(req, res){
   userManager.addToken(req.user._id, req.body.token, function(updatedUser){
      res.send(updatedUser);
   }, function(error){
      res.sendStatus(500);
   });

});


router.post('/call/:id', passport.authenticate('basic', {session: false}), function(req, res){
   var contactId = req.params.id;
   userManager.sendCallInvitation(req.user._id, req.params.id, function(data){
      res.send(200);
   }, function(error){
      res.send(500);
   })
});

router.post('/call/:id/accept', passport.authenticate('basic', {session: false}), function(req, res){
   userManager.acceptCall(req.user._id, req.params.id, function(data){
      res.send(200);
   }, function(error){
      res.send(500);
   })
});

router.post('/call/:id/reject', passport.authenticate('basic', {session: false}), function(req, res){
   //userManager.acceptCall(req.user._id, req.params.id, function(data){
   //   res.send(200);
   //}, function(error){
   //   res.send(500);
   //})
});

module.exports = function(injectedUserManager){
   userManager = injectedUserManager;
   //user = injectedUserManager.User;

   passport.use(new Strategy(
       function(username, password, cb) {
          userManager.login(username, password, function(loggedUser){
             return cb(null, loggedUser);
          }, function(){
             return cb(null, false);
          });
       }));
   return router;
};