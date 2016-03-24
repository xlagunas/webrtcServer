var express = require('express');
var router = express.Router();
var passport = require('passport');
var user = require('../User').User;
var _ = require('underscore');
var pushNotification = require('../push-sender');

//TODO check where to refactor this
var friendshipRequestedTypeMessage = 1;
var callTypeMessage = 2;
//CHECK IF THERES SOME KIND OF ENUM CONCEPT
var friendshipAcceptedTypeMessage = 3;


router.put("/:id", passport.authenticate('basic', {session: false}), function (req, res) {
    console.log(req.user._id + ':' + req.params.id);
    user.createRelation(req.user, req.params.id, 'requested', function (error, contactData) {
        user.createRelation(req.params.id, req.user._id, 'pending', function (error, remoteContactData) {

            if (!error && remoteContactData !== null && remoteContactData.uuid !== null) {
                var tokens = _.pluck(remoteContactData.uuid, 'token');
                console.log("Extracted tokens: " + JSON.stringify(tokens));

                pushNotification.sendMessage(tokens,
                    {
                        username: req.user.username,
                        name: req.user.name + " " + req.user.firstSurname + " " + req.user.lastSurname,
                        thumbnail: req.user.thumbnail,
                        type: friendshipRequestedTypeMessage
                    });
            }

            res.send(contactData);
        });
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

    if (previousState === 'requested' && nextState == 'accepted'){
        acceptFriendship(req.user, req.body.id, callbackHandler);
    } else {
        user.swapUserRelation(req.user, req.body.id, req.body.previousState, req.body.nextState, callbackHandler);
    }



});

router.get("/", passport.authenticate('basic', {session: false}), function (req, res) {
    user.listUserContacts(req.user, callbackHandler);
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
    user.swapUserRelation(req.user, req.body.id, 'requested', 'accepted', callback);
    //update and send push notification to the requestee
    user.swapRelation(req.body.id, req.user._id, 'pending', 'accepted', function (err, user) {
        if (err) {
            console.log("Error recovering updating relationship for user id:" + req.body.id);
        } else {
            pushNotification.sendMessage(user.uuid,
                {
                    username: req.user.username,
                    name: req.user.name + " " + req.user.firstSurname + " " + req.user.lastSurname,
                    thumbnail: req.user.thumbnail,
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
var callbackHandler = function (err, user) {
    if (err) {
        res.sendStatus(404);
    } else {
        res.send(user);
    }
};

module.exports = router;