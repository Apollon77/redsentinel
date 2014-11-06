var events = require('events')
  , redis = require('redis')
  , util = require('./util');

var client_redis = null;


function RedisSentinel(sentinels, options) {
  if (!(this instanceof RedisSentinel)) {
    return new RedisSentinel(sentinels, options);
  }

  var sentinel = this;

  // Simple validation:
  RedisSentinel._validateSentinelList(sentinels);

  // Extend the default values with the custom parameters:
  var defaults = {
    createClient: client_redis && client_redis.createClient,
    logging:      false,
    redisOptions: {},
    watchedNames: null,
  };
  this.options = _.extend(defaults, options);

  // Store connection info for all the sentinels:
  this.sentinels = util.shuffleArray(
    sentinels.map(function (conf) {
      var host = conf.host
        , port = conf.port || 26379;

      return { host: host, port: port };
    })
  );

  // Try to connect a sentinel:
  this._connectSentinel(function (err, client) {
    if (err) {
      sentinel.emit("error", err);
      return;
    }

    // Else, we have a sentinel connection, so store it, and try to fetch configs:
    sentinel.client = client;
    sentinel._loadConfigs();
  });
}

// Inherit from EventEmitter, so we can emit stuff:
util.inherits(RedisSentinel, events.EventEmitter);


/**
 * Will do basic validation on a sentinel list. Throws if there was a problem.
 * 
 * @param  {Array} sentinels The sentinel list, from the user.
 */
RedisSentinel._validateSentinelList = function _validateSentinelList(sentinels) {
  
  // First, check type:
  if (!sentinels || !Array.isArray(sentinels)) {
    throw new TypeError("First argument needs to be an array");
  }

  // Now go through each item in the list, and make sure that there's the necessary info:
  sentinels.forEach(function (item, idx) {
    if (typeof item !== 'object') {
      throw new TypeError("Item #" + idx + " in sentinels array isn't an object");
    }
    if (!item.host || typeof item.host !== 'string') {
      throw new Error("Item #" + idx + " in sentinels array doesn't have a correct host property");
    }
  });
};


/**
 * A simple logging function. Will write to stdout IFF we were told to in the user configs.
 * Arguments are the same format as for node util's format function, with the exception that
 * all instances of Error with a 'stack' property are evaluated as that, and as a string
 * otherwise.
 */
RedisSentinel.prototype._log = function _log() {
  if ( ! this.options.logging) { return; }

  var i, len = arguments.length;
  for (i=0; i<len; i++) {
    var arg = arguments[i];
    if (arg instanceof Error) {
      arguments[i] = (arg.stack) ? arg.stack : String(arg);
    }
  }
  var str = util.format.apply(util, arguments);
  console.log(str);
}


/**
 * Will try to connect to each item in the sentinels array, in order, until it is
 * successful.
 * 
 * @param  {Function} cb Called when done with args: (err, client)
 */
RedisSentinel.prototype._connectSentinel = function _connectSentinel(cb) {
  var sentinel = this;

  util.async.forEachSeries(
    this.sentinels,
    function withEachSentinel(conf, next) {
      var client = redis.createClient(conf.port, conf.host);
      
      function _onReady() {
        client.removeListener('error', _onError);
        sentinel._log("Successfully connected to %s:%d", conf.host, conf.port);
        cb(null, client);
      }

      function _onError() {
        client.removeListener('ready', _onReady);
        client.end();
        sentinel._log("Failed to connect to %s:%d", conf.host, conf.port);
        next();
      }

      client.once('ready', _onReady);
      client.once('error', _onError);
    },
    function (err) {
      err = err || new Error("Could not connect to a sentinel. *<:'O(");
      cb(err);
    }
  );
};


RedisSentinel.prototype._loadConfigs = function _loadConfigs() {

}


// Exports:
module.exports.RedisSentinel = RedisSentinel;

// Internal API for passing along the client's Redis library:
module.exports.setClientRedis = function setClientRedis(mod) {
  client_redis = mod;
};
