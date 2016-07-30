var express = require('express');
var router = express.Router();
var passport = require('passport');
var userManager;
var _ = require('underscore');

//var pushNotification = require('push-sender');

//TODO check where to refactor this
var friendshipRequestedTypeMessage = 1;
var callTypeMessage = 2;
//CHECK IF THERES SOME KIND OF ENUM CONCEPT


router.put("/:id", passport.authenticate('basic', {session: false}), function (req, res) {
    console.log(req.user._id + ':' + req.params.id);

    userManager.requestRelationship(req.user._id, req.params.id, function(data){
        console.log(data);
        res.send(data);
    }, function(error){
        res.sendStatus(404);
    });

});

//update one relationship status
//{
//    "id": "56cf31ec7bbb67fb13f6c32b",
//    "previousState": "pending",
//    "nextState": "accepted"
//}
router.post("/update", passport.authenticate('basic', {session: false}), function (req, res) {
    console.log(req.user._id);
    console.log(req.body.id);
    console.log(req.body.previousState);
    console.log(req.body.nextState);

    var previousState = req.body.previousState;
    var nextState = req.body.nextState;

    var reqFunction;

    if (nextState === 'accepted'){
        var reqFunction= userManager.acceptRelationship;

    } else if (nextState === 'rejected'){
        var reqFunction = userManager.rejectRelationship;
    }

    reqFunction(req.user.id, req.body.id, function(data){
        console.log(data);
        res.send(data);
    }, function(error){
        console.log(error);
        res.sendStatus(404);
    });

});

router.delete("/:id", passport.authenticate('basic', {session: false}), function (req, res) {
    console.log(req.user._id + ':' + req.params.id);

    userManager.deleteRelationship(req.user._id, req.params.id, function(data){
        console.log(data);
        res.send(data);
    }, function(error){
        res.sendStatus(404);
    });

});

router.get("/", passport.authenticate('basic', {session: false}), function (req, res) {
    userManager.listAllContacts(req.user.id, function(contacts){
       res.send(contacts);
    }, function(error){
        res.sendStatus(404);
    });
});

module.exports = function(injectedUserManager){
    userManager = injectedUserManager;
    return router;
};