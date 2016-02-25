/**
 * Created with JetBrains WebStorm.
 * User: xlagunas
 * Date: 06/03/14
 * Time: 09:53
 * To change this template use File | Settings | File Templates.
 */

var Mongoose = require('mongoose'),
    Schema = Mongoose.Schema
    , ObjectId = Schema.ObjectId;


var CalendarEventSchema = new Schema({
    users: [{type: ObjectId, ref: 'User'}],
    start: Date,
    end: Date,
    title: String,
    confirmed: Boolean
});

CalendarEventSchema.statics.getUserEvents = function (idUser, callback) {
    CalendarEvent.find({users: idUser}, function(error, events){
        if (!error && events){
            callback(events);
        }
        else{
            console.log('There is some problem!')
        }
    });
};

CalendarEventSchema.methods.addUser = function (idUser, callback){
    this.users.addToSet(idUser);
    this.save(function(error, data){
        if(!error && data){
            callback(data);
        }
    });
};

CalendarEventSchema.methods.delUser = function (idUser, callback){
    this.users.pull(idUser);
    if (this.users.length === 0){
        console.log('no more users in the event, deleting it');
        this.remove(function(err){
            if (!err)
                callback();
        });
    }
    else{
        this.save(function(error, data){
            if (!error && data){
                callback();
            }
        });
    }

};

var CalendarEvent = Mongoose.model('CalendarEvent', CalendarEventSchema);

exports.CalendarEvent = CalendarEvent;