/**
 * Created with JetBrains WebStorm.
 * User: xlagunas
 * Date: 03/02/14
 * Time: 09:48
 * To change this template use File | Settings | File Templates.
 */


var mongoose = require('mongoose'),
    _ = require('underscore');
    // ldap = require('./ldap');

mongoose.Promise = global.Promise;
mongoose.Promise = require('bluebird');


var userSchema = mongoose.Schema(
    {
        username: {type: String, index: true, unique: true, required: true},
        name: String,
        firstSurname: String,
        lastSurname: String,
        email: {type: String, required: true},
        status: {type: String, default: 'OFFLINE'},
        password: {type: String, required: false},
        accepted: [{type: mongoose.Schema.ObjectId, ref: 'User'}],
        pending: [{type: mongoose.Schema.ObjectId, ref: 'User'}],
        blocked: [{type: mongoose.Schema.ObjectId, ref: 'User'}],
        requested: [{type: mongoose.Schema.ObjectId, ref: 'User'}],
        joinDate: {type: Date, default: Date.now()},
        thumbnail: {type: String, default: 'profile.png'},
        // isLdap: Boolean,
        uuid: [{type: String}],
        isPhone: {type: Boolean, default: false},
        facebookId: {type: String, required: false},
        googleId: {type: String, required: false}
    }
);

userSchema.virtual('updatedStatus')
    .get(function () {
        if (!this.currentStatus)
            return 'OFFLINE';
        return this.currentStatus;
    }).set(function (v) {
    this.currentStatus = v;
});

userSchema.set('toJSON', {getters: true, virtuals: true});
userSchema.set('toObject', {getters: true, virtuals: true});


userSchema.statics.login = function (username, password, callback) {
    this.findOne({username: username})
        .populate(
            {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail'
            })
        .exec(function (error, user) {
            if (!error && user && user.password !== null && user.password == password) {
                callback({status: 'success', user: user});
            }
            else {
                callback({status: 'error', msg: 'password doesn\'t match'})
            }

        });
};

userSchema.statics.findByUsername = function (username, cb) {
    this.findOne({username: username}, cb);
};

userSchema.statics.findByEmail = function (email, cb) {
    this.findOne({email: email}, cb);
};

userSchema.statics.findMatchingUsers = function (matchingUsername, callback) {
    this
        .find({username: new RegExp(matchingUsername, "i")})
        .select("-pending -password -accepted -requested -blocked")
        .exec(callback);
};

userSchema.statics.swapRelation = function (idUser, idContact, currentStatus, futureStatus, callback) {
    this.findById(idUser, function (error, user) {
        if (!error) {
            if (user) {
                user.changeRelationStatus(currentStatus, futureStatus, idContact, callback);
            }
        }
    });
};

userSchema.statics.swapUserRelation = function (user, idContact, currentStatus, futureStatus, callback) {
    user.changeRelationStatus(currentStatus, futureStatus, idContact, callback);
};

userSchema.statics.createRelation = function (idProposer, idContact, status, callback) {
    this.findById(idProposer, function (error, user) {
        if (error)
            callback(error);
        else {
            userSchema.statics.createUserRelation(user, idContact, status, callback);
        }
    });
};

userSchema.statics.createUserRelation = function (user, idContact, status, callback) {
    user[status].addToSet(idContact);
    user.save(function (error, savedUser) {
        if (error) {
            callback(error);
        } else if (savedUser) {
            User.populate(savedUser,
                {
                    path: 'pending accepted requested blocked',
                    select: 'name username firstSurname lastSurname email thumbnail isPhone'
                }
                , function (error, populatedData) {
                    if (!error && populatedData) {
                        callback(null, populatedData);
                    } else
                        callback(error);
                });
        }
    });
};

userSchema.statics.getRelationshipUsers = function (requesterId, requesteeId, callback) {
    this.find({$or: [{'_id': requesterId}, {'_id': requesteeId}]}, callback);
};

userSchema.statics.listContacts = function (id, callback) {
    this
        .findById(id)
        .exec(function (error, populatedData) {
            if (!error && populatedData) {
                userSchema.statics.listUserContacts(populatedData, callback);
            }
        });
};

userSchema.statics.listUserContacts = function (user, callback) {
    User.populate(user,
        {
            path: 'pending accepted requested blocked',
            select: 'name username firstSurname lastSurname email thumbnail isPhone'
        },
        function (error, populatedData) {
            if (error) {
                callback(error);
            }
            else {
                callback(null, {
                    accepted: populatedData.accepted,
                    requested: populatedData.requested,
                    pending: populatedData.pending,
                    blocked: populatedData.blocked
                });
            }
        });
};

userSchema.statics.exists = function (username, callback) {
    this.findOne({username: username}, function (error, user) {
        if (!error) {
            if (user)
                return callback(true);
            else {
                ldap.existsLdap(username, callback);
            }

        } else {
            return callback(false);
        }
    });
};

userSchema.methods.updateImage = function (filename, callback) {
    this.thumbnail = filename;
    this.save(function (error, savedUser, numModified) {
        if (error) {
            callback(error, null);
        } else {
            User.populate(savedUser, {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail isPhone'
            }, callback);
        }
    });
};

userSchema.statics.updateSocialFB = function (email, facebookId, thumbnail, callback) {

    this.findByEmail(email, function (err, user) {
        if (err) {
            callback(err, null);
        } else {
            user.facebookId = facebookId;
            user.thumbnail = thumbnail;
            user.save(function (error, savedUser) {
                if (error) {
                    callback(error, null);
                } else {
                    User.populate(savedUser, {
                        path: 'pending accepted requested blocked',
                        select: 'name username firstSurname lastSurname email thumbnail isPhone'
                    }, callback);
                }
            });
        }


    });
};

userSchema.statics.updateSocialGoogle = function (email, googleId, thumbnail, callback) {

    this.findByEmail(email, function (err, user) {
        if (err) {
            callback(err, null);
        } else {
            user.googleId = googleId;
            user.thumbnail = thumbnail;
            user.save(function (error, savedUser) {
                if (error) {
                    callback(error, null);
                } else {
                    User.populate(savedUser, {
                        path: 'pending accepted requested blocked',
                        select: 'name username firstSurname lastSurname email thumbnail isPhone'
                    }, callback);
                }
            });
        }


    });
};

userSchema.methods.changeRelationStatus = function (oldStatus, newStatus, userId, callback) {
    console.log('Changing relationship Status!');

    if (this[oldStatus].indexOf(userId) != -1) {
        this[oldStatus].pull(userId);
        this[newStatus].addToSet(userId);

        this.save(function (error, savedUser, numModified) {
            console.log('savedUser: ' + savedUser);
            if (error) {
                callback(error, null);
            } else {
                User.populate(savedUser,
                    {
                        path: 'pending accepted requested blocked',
                        select: 'name username firstSurname lastSurname email thumbnail isPhone'
                    },
                    callback);
            }
        });

    } else {
        console.log('Couldn\'t change relationship status bc no oldRelation with the user was found!');
        callback("error", null);
    }

};

userSchema.statics.getToken = function (userId, callback) {
    this.findById(userId, callback);
};

userSchema.statics.addRelationship = function (userId, relationshipType, requestee, callback) {
    var json = {};
    json[relationshipType] = requestee;

    this.findByIdAndUpdate({_id: userId},
        {$push: json},
        {safe: true, upsert: true, new: true})
        .populate(
            {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail isPhone'
            })
        .exec(callback)
};

userSchema.statics.removeRelationship = function (userId, relationshipType, requestee, callback) {
    var json = {};
    json[relationshipType] = requestee;

    this.findByIdAndUpdate({_id: userId},
        {$pop: json},
        {safe: true, upsert: true, new: true})
        .populate(
            {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail isPhone'
            })
        .exec(callback);
};

userSchema.statics.updateRelationship = function (userId, currentRelationshipStatus, futureRelationshipStatus, requestee, callback) {
    var currentRelationshipJson = {};
    currentRelationshipJson[currentRelationshipStatus] = requestee;
    var futureRelationshipJson = {};
    futureRelationshipJson[futureRelationshipStatus] = requestee;

    this.findByIdAndUpdate({_id: userId},
        {
            $pop: currentRelationshipJson,
            $push: futureRelationshipJson
        }, {
            safe: true, upsert: true, new: true
        })
        .populate(
            {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail isPhone'
            })
        .exec(callback);

};

userSchema.statics.addToken = function (userId, token, callback) {
    this.findByIdAndUpdate({_id: userId}, {$addToSet: {uuid: token}, isPhone: true}, {
            safe: true,
            upsert: false,
            new: true
        })
        .populate(
            {
                path: 'pending accepted requested blocked',
                select: 'name username firstSurname lastSurname email thumbnail isPhone'
            }).exec(callback);
};

userSchema.statics.removeTokens = function (userId, tokens, callback) {
    this.findByIdAndUpdate({_id: userId}, {$pullAll: {uuid: tokens}}, {
        safe: true,
        upsert: false,
        new: true
    }, callback);
};

userSchema.statics.checkIfRelationshipExists = function (requester, requestee, callback) {
    this.findById(requester).populate({
        path: 'pending accepted requested blocked',
        select: 'id'
    }).exec(function (error, user) {
        if (error) {
            callback(error);
        } else {
            //if (requester.accepted)
            var contacts = [];
            contacts = user.accepted !== null ? contacts.concat(user.accepted) : contacts;
            contacts = user.requested !== null ? contacts.concat(user.requested) : contacts;
            contacts = user.blocked !== null ? contacts.concat(user.blocked) : contacts;

            var contacts = _.pluck(contacts, 'id');
            if (callback) {
                callback(null, _.contains(contacts, requestee));
            }
        }

    });
};

var User = mongoose.model('User', userSchema);
exports.User = User;

function test() {
    mongoose.connect('mongodb://localhost/rest_test');

    //User.removeRelationship('576aa729154318d5030377bc', 'accepted', '579560fa3e513a710a6bdc3a', function (error, exists) {
    //    console.log(error);
    //    console.log(exists);
    //});
    //
    //User.removeRelationship('579560fa3e513a710a6bdc3a', 'accepted', '576aa729154318d5030377bc', function (error, exists) {
    //    console.log(error);
    //    console.log(exists);
    //});
    //User.findByEmail('xlagunas@gmail.com', function(err, data){
    //    console.log(err);
    //    console.log(data);
    //});
}

//test();
