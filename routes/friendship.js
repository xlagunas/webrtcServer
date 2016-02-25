var express = require('express');
var router = express.Router();
var passport = require('passport');
var user = require('../User.js').User;


router.put("/:id", passport.authenticate('basic', {session: false}), function(req, res){
    console.log(req.user._id +':'+ req.params.id);
    user.createRelation(req.user._id, req.params.id, 'requested', function(contactData){
        res.send(contactData);
    });
});

//update one relationship status
//{
//    "id": "56cf31ec7bbb67fb13f6c32b",
//    "previousState": "pending",
//    "nextState": "accepted"
//}
router.post("/update", passport.authenticate('basic', {session: false}), function(req, res){
    console.log(req.body.id)
    console.log(req.body.previousState)
    console.log(req.body.nextState)

    res.sendStatus(200);
});

module.exports = router;