var findComplex = require('loopback-postgres-find-complex');
var exclude = [];
var include = [];

module.exports = function(app){
  models = app.models();
  models.forEach(function(model){
    modelName = model.definition.name;
    dataSource = model.getDataSource();
    if(dataSource != null){
       adapter = dataSource.adapter.name;
    }
    else{
	adapter = false;
    }
    if(exclude.indexOf(modelName) == -1 && adapter == 'postgresql' && (include.length == 0 || include.indexOf(modelName) != -1)){
      model.findComplex = function(filter,cb){
        complex = new findComplex(model);
        complex.init();
        complex.find(filter,cb);
        // cb();
      }
      model.remoteMethod('findComplex', {
               http: {path: '/findComplex', verb: 'POST'},
               accepts: {arg: 'filter', type: 'object'},
               returns: {arg: modelName, type: 'array'}});

    }
  });
}
