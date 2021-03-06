
/**
 * Module dependencies.
 * @api private
 */

var constraints = require('constraints');
var Emitter = require('emitter');
var Queue = require('emitter-queue');
var channel = require('./lib/channel');
// var trace = require('trace')('peer');


/**
 * Shim
 */

var PeerConnection = (window.RTCPeerConnection ||
  window.mozRTCPeerConnection ||
  window.webkitRTCPeerConnection);
var Candidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
var Session = window.RTCSessionDescription || window.mozRTCSessionDescription;


/**
 * Expose 'peer'
 */

module.exports = Peer;


/**
 * Create and initialize peer
 * connection,
 *
 *
 * Examples:
 *
 *   var foo = peer();
 *   var bar = peer(servers);
 *
 * @param {Array} options
 * @param {Object} options
 * @api public
 */

function Peer(options) {
  if(!(this instanceof Peer)) return new Peer(options);
  this.connection = null;
  // we should extend default with options
  this.constraints = constraints({
    optional: [],
    mandatory: [],
    channel: true
  }, options);
  this.codecs = [];
}


Emitter(Peer.prototype);
Queue(Peer.prototype);


/**
 * Create and initialize peer
 * connection.
 *
 * Should be call before offer or answer.
 *
 * @api private
 */

Peer.prototype.create = function() {
  var that = this;
  this.connection = new PeerConnection(this.constraints.servers());
  this.connection.onaddstream = function(event) {
    that.emit('remote stream', event.stream);
    //trace('add remote stream');
  };
  this.connection.onicecandidate = function(event) {
    var candidate = event.candidate;
    if(candidate) that.emit('candidate', candidate, event);
    else that.queue('ready');
    //trace('ice candidate');
  };
  this.connection.ongatheringchange =  function(event) {
    var target = event.currentTarget;
    if (target && target.iceGatheringState === 'complete') {
      that.queue('ready');
    }
  };
  this.emit('create');
  //trace('create');
};


/**
 * Add local stream to peer connection.
 *
 * @param  {MediaStream} stream
 * @api private
 */

Peer.prototype.stream = function(stream) {
  this.connection.addStream(stream);
  this.queue('local stream', stream);
  //trace('add local stream');
};


/**
 * Set ice candidate.
 *
 * @param  {candidate} candidate
 * @api private
 */

Peer.prototype.ice = function(candidate) {
  if(candidate) this.connection.addIceCandidate(new Candidate(candidate));
  //trace('add ice candidate');
};


/**
 * Set local session descriptor.
 *
 * If exists, apply codecs on the session
 * description string.
 *
 * @param  {RTCSessionDescription} session
 * @api private
 */

Peer.prototype.local = function(session) {
  var sdp = session.sdp;
  for(var i = 0, l = this.codecs.length; i < l; i++) {
    sdp = this.codecs[i](sdp);
  }
  session.sdp = sdp;
  this.connection.setLocalDescription(new Session(session));
  //trace('set local description');
};


/**
 * Set remote session descriptor.
 *
 * @param  {RTCSessionDescription} session
 * @api private
 */

Peer.prototype.remote = function(session) {
  this.connection.setRemoteDescription(new Session(session));
  //trace('set remote description');
};


/**
 * Create offer or answer
 * session description.
 *
 * @param  {Function} fn
 * @param  {Object}   constraints
 * @param  {String}   type=
 * @api private
 */

Peer.prototype.session = function(fn, opts, type) {
  var that = this;
  var handler = (type === 'offer') ? 'createOffer' : 'createAnswer';
  this.emit('before ' + type);
  this.connection[handler](function(offer) {
    //trace('set session ' + type);
    that.local(offer);
    if(fn) fn(offer);
    that.queue(type, offer);
  },function(e) {
    that.emit('error', e);
  }, opts);
};


/**
 * Initialize master peer connection
 * and create offer.
 *
 * Emit and queue offer event.
 *
 * Examples:
 *
 *   var master = peer();
 *   master.on('offer', function(offer) {
 *     // do something with offer
 *   });
 *
 * @param {Object} constraints optional
 * @api private
 *
 * @see  http://github.com/bredele/emitter-queue
 */

Peer.prototype.offer = function(fn, constraints) {
  this.channel = channel(this.connection.createDataChannel('master'), this);
  this.session(fn, constraints, 'offer');
};


/**
 * Initialize slave peer connection
 * and create answer.
 *
 * Emit and queue answer event.
 *
 * Examples:
 *
 *   var slave = peer();
 *   slave.on('answer', function(offer) {
 *     // do something with offer
 *   });
 *
 * @param {Object} constraints optional
 * @api private
 *
 * @see  http://github.com/bredele/emitter-queue
 */

Peer.prototype.answer = function(fn, constraints) {
  var that = this;
  this.connection.ondatachannel = function(event) {
    that.channel = channel(event.channel, that);
  };
  this.session(fn, constraints, 'answer');
};


/**
 * Return peer connection state.
 *
 * @return {String}
 * @api public
 */

Peer.prototype.state = function() {
  return this.connection.signalingState;
};


/**
 * Set peer codecs.
 *
 * A codec is a function which
 * modifies the session description
 * and return a new one.
 *
 * Examples:
 *
 *   peer.codec(function(session) {
 *     // do something
 *   });
 *
 * @param {Function} fn
 * @api public
 */

Peer.prototype.codec = function(fn) {
  this.codecs.push(fn);
  return this;
};



/**
 * Send message.
 *
 * A message will be sent through a data channel only
 * if a channel has been openned through the constraints.
 *
 * Examples:
 *
 *  peer.send('hello');
 *
 * @return {this}
 * @api public
 */

Peer.prototype.send = function(msg) {
  this.queue('channel message', msg);
  return this;
};


/**
 * Use middlewares to extend peer.
 *
 * Examples:
 *
 *   peer.use(plugin, 'something');
 *
 * @param  {Function} fn
 * @return {this}
 * @api public
 */

Peer.prototype.use = function(fn) {
  var args = [].slice.call(arguments, 1);
  fn.apply(this, [this].concat(args));
  return this;
};
