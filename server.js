#!/bin/env node

var express = require('express');
var fs      = require('fs');
var mongoose = require('mongoose').set('debug', true);
var Schema = mongoose.Schema;
var ObjectId = mongoose.Types.ObjectId;

var App = function(){

  // Scope
  var self = this;

  // Setup
  self.dbUser = process.env.OPENSHIFT_NOSQL_DB_USERNAME;
  self.dbPass = process.env.OPENSHIFT_NOSQL_DB_PASSWORD;
  self.dbHost = process.env.OPENSHIFT_NOSQL_DB_HOST;
  self.dbPort = parseInt(process.env.OPENSHIFT_NOSQL_DB_PORT);
  self.ipaddr  = process.env.OPENSHIFT_INTERNAL_IP;
  self.port    = parseInt(process.env.OPENSHIFT_INTERNAL_PORT) || 8080;
  if (typeof self.ipaddr === "undefined") {
    console.warn('No OPENSHIFT_INTERNAL_IP environment variable');
  };


  // Web app logic
  self.routes = {};
  self.routes['health'] = function(req, res){ res.send('1'); };
  
  self.routes['root'] = function(req, res){res.send('You have come to the park apps web service. All the web services are at /ws/parks*. For example /ws/parks will return all the parks in the system in a JSON payload. Thanks for stopping by and have a nice day'); };

  //returns all the parks in the collection
  self.routes['returnAllParks'] = function(req, res){
      self.Parkpoint.find().exec(function(err, names) {
        if(err){throw err};
        res.header("Content-Type:","application/json");
        res.end(JSON.stringify(names));
      });
  };

  //find a single park by passing in the objectID to the URL
  self.routes['returnAPark'] = function(req, res){
    try{
      var parkObjectID = new ObjectId(req.params.id);
      self.Parkpoint.find({'_id':parkObjectID}).exec(function(err, names){
              if(err){console.trace(err);};
              res.header("Content-Type:","application/json");
              res.end(JSON.stringify(names));
      });
    }catch(err){
      res.send("Error: "+err.message);
      console.trace(err);
    }
  };


  //find parks near a certain lat and lon passed in as query parameters (near?lat=45.5&lon=-82)
  self.routes['returnParkNear'] = function(req, res){
      //in production you would do some sanity checks on these values before parsing and handle the error if they don't parse
      var lat = parseFloat(req.query.lat);
      var lon = parseFloat(req.query.lon);

      self.Parkpoint.find({"pos" : {$near: [lon,lat]}}).exec(function(err,names){
          res.header("Content-Type:","application/json");
          res.end(JSON.stringify(names));
       });
  };


  self.routes['returnParkNameNear'] = function(req, res){
      var lat = parseFloat(req.query.lat);
      var lon = parseFloat(req.query.lon);
      var name = req.params.name;
      self.Parkpoint.find({"Name" : {$regex : name, $options : 'i'}, "pos" : { $near : [lon,lat]}}).exec(function(err,names){
          res.header("Content-Type:","application/json");
          res.end(JSON.stringify(names));
      });
  };

  self.routes['postAPark'] = function(req, res){

     var name = req.body.name;
     var lat = req.body.lat;
     var lon = req.body.lon;
     console.log(req.body);

     var park = new self.Parkpoint({
        Name: name, 
        pos: [lon,lat]
     });

     park.save(function(error, result){
       if(error){
          res.send(error.message);
       }
       else{
          res.end('success');
       }
     });
  };





  // Web app urls
  
  self.app  = express();

  //This uses the Connect frameworks body parser to parse the body of the post request
  self.app.configure(function () {
        self.app.use(express.bodyParser());
        self.app.use(express.methodOverride());
        self.app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  //define all the url mappings
  self.app.get('/health', self.routes['health']);
  self.app.get('/', self.routes['root']);
  self.app.get('/ws/parks', self.routes['returnAllParks']);
  self.app.get('/ws/parks/park/:id', self.routes['returnAPark']);
  self.app.get('/ws/parks/near', self.routes['returnParkNear']);
  self.app.get('/ws/parks/name/near/:name', self.routes['returnParkNameNear']);
  self.app.post('/ws/parks/park', self.routes['postAPark']);

  // Logic to open a database connection. We are going to call this outside of app so it is available to all our functions inside.

  self.connectDb = function(callback){
    self.dbConn=mongoose.createConnection(self.dbHost, "parks", self.dbPort, {user:self.dbUser, pass:self.dbPass});
    self.dbConn.on('error', function(err){throw err;});
    self.dbConn.once('open', function(){
      callback();
      self.Parkpoint=self.dbConn.model('Parkpoint', 
               new Schema({ Name: String, pos: [Number]})); 
    });
  };
  
  
  //starting the nodejs server with express
  self.startServer = function(){
    self.app.listen(self.port, self.ipaddr, function(){
      console.log('%s: Node server started on %s:%d ...', Date(Date.now()), self.ipaddr, self.port);
      console.log('Mongoose version: '+mongoose.version);
    });
  }

  // Destructors
  self.terminator = function(sig) {
    if (typeof sig === "string") {
      console.log('%s: Received %s - terminating Node server ...', Date(Date.now()), sig);
      process.exit(1);
    };
    console.log('%s: Node server stopped.', Date(Date.now()) );
  };

  process.on('exit', function() { self.terminator(); });

  self.terminatorSetup = function(element, index, array) {
    process.on(element, function() { self.terminator(element); });
  };

  ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGTERM'].forEach(self.terminatorSetup);

};

//make a new express app
var app = new App();

//call the connectDb function and pass in the start server command
app.connectDb(app.startServer);