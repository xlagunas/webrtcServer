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

    if (previousState === 'pending' && nextState == 'accepted'){
        acceptFriendship(req.user, req.body.id, callbackHandler(res));
    } else {
        user.swapUserRelation(req.user, req.body.id, req.body.previousState, req.body.nextState, callbackHandler(res));
    }



});

router.get("/", passport.authenticate('basic', {session: false}), function (req, res) {
    user.listUserContacts(req.user, callbackHandler(res));
});
/**
 * This function updates the friendship status in both sides, the requester is updated from requested to accepted
 * and the contact gets updated from pending to accepted. In top of that, there's a push notification issued to
 * the requested user notifying about the relationship change.
 *
 * @param requesterUser The user who issues the action
 * @param requestedContactId the id of the contact target
 * @param callback the callback with the result
 */
var acceptFriendship = function (requesterUser, requestedContactId, callback) {
    //update and return the requester of the change
    user.swapRelation(requesterUser.id, requestedContactId, 'pending', 'accepted', callback);
    //update and send push notification to the requestee
    user.swapRelation(requestedContactId, requesterUser._id, 'requested', 'accepted', function (err, user) {
        if (err) {
            console.log("Error recovering updating relationship for user id:" + requestedContactId);
        } else {
            pushNotification.sendMessage(user.uuid,
                {
                    username: requesterUser.username,
                    name: requesterUser.name + " " + requesterUser.firstSurname + " " + requesterUser.lastSurname,
                    thumbnail: requesterUser.thumbnail,
                    type: friendshipAcceptedTypeMessage
                });
        }
    });
};

/**
 * Generic callback handler where in case of error a 404 code is bounced up and otherwise we return the obtained value
 * @param err
 * @param user
 */
var callbackHandler = function (res) {
    return function(err, user) {
        if (err) {
            res.sendStatus(404);
        } else {
            res.send(user);
        }
    };
};

module.exports = function(injectedUserManager){
    userManager = injectedUserManager;
    return router;
};