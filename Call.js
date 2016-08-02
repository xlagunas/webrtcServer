/**
 * Created with JetBrains WebStorm.
 * User: xlagunas
 * Date: 09/03/14
 * Time: 21:19
 * To change this template use File | Settings | File Templates.
 */

var Mongoose = require('mongoose'),
    Schema = Mongoose.Schema
    , ObjectId = Schema.ObjectId;


var CallSchema = new Schema({
    caller: {type: ObjectId, ref: 'User'},
    callee: [{type: ObjectId, ref: 'User'}],
    start: {type: Date, default: Date.now()},
    end: Date,
    status: {type: String, enum: ['ANSWERED', 'CANCELLED', 'UNATTENDED'], default: 'UNATTENDED'}
});

CallSchema.statics.addUserToCall = function (idCall, idUser, callback) {
    //MODIFIED THIS ON 01/08/2016
    this.findByIdAndUpdate({_id: idCall},
        {$addToSet: {callee: idUser}, status: 'ANSWERED'},
        {safe: true, upsert: true, new: true})
        .populate(
            {   path: 'caller callee',
                select: 'name username firstSurname lastSurname email thumbnail'
            })
        .exec(callback);
    //this.findById(idCall, function(error, call){
    //    if (!error && call){
    //        call.callee.addToSet(idUser);
    //        call.status = 'ANSWERED';
    //        call.save(function(error, savedCall){
    //            if (!error && call){
    //                console.log('user: ' +idUser+ ' successfully added to call: '+idCall);
    //                Call.populate(savedCall,
    //                    {
    //                    path: 'caller callee',
    //                    select: 'name username firstSurname lastSurname email thumbnail'
    //                    },
    //                    callback);
    //            }
    //            else
    //                console.log('error updating users in call');
    //        });
    //    }
    //    else{
    //        console.log('There is some problem!')
    //    }
    //});
};

CallSchema.statics.updateCallStatus = function (idCall, status) {
    CallSchema.findByIdAndUpdate(idCall, {status: status},function (error, call){
        if(!error && call){
            console.log('successfully updated status');
            console.log(call);
        }
        else {
            console.log('error updating status');
            console.log(error);
        }
    });
};

CallSchema.statics.endCall = function (idCall) {
    CallSchema.findByIdAndUpdate(idCall, {end: Date.now()}, function (error, call){
        if (!error && call){
            console.log('successfully updated status');
            console.log(call);
        }
        else {
            console.log('error updating status');
            console.log(error);
        }
    });
};

CallSchema.statics.getUserCalls = function (idUser, callback) {
    CallSchema.find().or([{caller: idUser},{callee: idUser}]).exec(function (error, calls){
        if (!error && calls){
            var incoming = [], outgoing = [], missed = [];
            console.log('found '+calls.length+ ' calls' );
            calls.forEach(function(call){
                if (call.callee === idUser){
                    console.log('detected outgoing call');
                    outgoing.push(call);
                }
                else {
                    if (status === 'ANSWERED'){
                        console.log('detected answered call');
                        incoming.push(call);
                    }
                    else if (status === 'UNATTENDED'){
                        console.log('detected missed call');
                        missed.push(call);
                    }
                }
            });
            console.log('total sorted calls: '+incoming.length + outgoing.length + missed.length);
            callback({status: 'success', data: {outgoing: outgoing, missed: missed, incoming: incoming}});
        }
        else{
            console.log('error');
            console.log(error);
            callback({status: 'error', data: null});
        }


    });
};

CallSchema.statics.createCall = function(callerId, calleeId, callback){
    this.create({caller: callerId, callee: [calleeId]}, function(err, call){
        if (err){
            callback(err, null);
        } else {
            Call.populate(call, { path: 'caller callee',  select: 'name username firstSurname lastSurname email thumbnail'}, callback);
        }
    });
};

CallSchema.statics.findCallById = function(callId, callback) {
    Call.findById(callId).populate({path: 'caller callee', select: 'name username firstSurname lastSurname email thumbnail'}).exec(callback);
};

function rejectCall (callId, callback) {
    Call.findByIdAndUpdate(callId,{status: 'CANCELLED'})
        .populate({
            path: 'caller callee',
            select: 'name username firstSurname lastSurname email thumbnail'
        })
        .exec(function(err, call){
            if (!err && call) {
                if (callback) callback(call);
            }
        });
}

var Call = Mongoose.model('Call', CallSchema);

exports.Call = Call;



