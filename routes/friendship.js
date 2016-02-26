var express = require('express');
var router = express.Router();
var passport = require('passport');
var user = require('../User.js').User;


router.put("/:id", passport.authenticate('basic', {session: false}), function(req, res){
    console.log(req.user._id +':'+ req.params.id);
    user.createRelation(req.user, req.params.id, 'requested', function(contactData){
        user.createRelation(req.params.id, req.user._id, 'pending', function(remoteContactData){
            res.send(contactData)
        });
    });
});

//update one relationship status
//{
//    "id": "56cf31ec7bbb67fb13f6c32b",
//    "previousState": "pending",
//    "nextState": "accepted"
//}
router.post("/update", passport.authenticate('basic', {session: false}), function(req, res){
    console.log(req.user._id);
    console.log(req.body.id);
    console.log(req.body.previousState);
    console.log(req.body.nextState);

    user.swapUserRelation(req.user, req.body.id, req.body.previousState, req.body.nextState, function(err, user){
        if (err){
            res.sendStatus(404);
        } else {
            res.send(user);
        }
    });

});

router.get("/", passport.authenticate('basic', {session: false}), function (req, res){
    user.listUserContacts(req.user, function(err, callback){
        if (err){
            res.sendStatus(404);
        } else {
            res.send(callback);
        }
    });
});

module.exports = router;