var ParameterizedSQL = require('loopback-connector/lib/parameterized-sql');
var SG = require('strong-globalize');
var g = SG();

module.exports = findComplex;

function findComplex(model){
  this.model = model;
}

findComplex.prototype.operators = ['=','!=','>','>=','<','<=','->','->>','?','BETWEEN','NOT BETWEEN','IN','NOT IN','LIKE','NOT LIKE','ILIKE','NOT ILIKE','IS NULL','IS NOT NULL',
                        'IS FALSE','IS NOT FALSE','IS TRUE','IS NOT TRUE','IS UNKNOWN','IS NOT UNKNOWN','SIMILAR TO','NOT SIMILAR TO','AND','OR'];
findComplex.prototype.joinTypes = ["INNER JOIN","RIGHT JOIN","LEFT JOIN","FULL OUTER JOIN"];
findComplex.prototype.sortOrder = ["ASC","DESC","NULLS FIRST","NULLS LAST"];
findComplex.prototype.castTypes = ["NUMERIC","SMALLINT","INT2","INTEGER","INT","INT4","BIGINT","INT8","REAL","FLOAT4","DOUBLE PRECISION","FLOAT8",
                                   "BOOLEAN","BOOL","BYTEA","MONEY","JSON","TEXT","MACADDR","DATE"];

findComplex.prototype.bannedFunc = ["SELECT","INSERT","DELETE","CREATE","UPDATE","ALTER","DROP","FOR","EACH","ROW","BEGIN","END","COMMIT","ROLLBACK","SAVEPOINT",
                                     "OVER","PATITION","FROM","WINDOW","FUNCTION","GRANT","REVOKE","GETPGUSERNAME","CURRENT_DATABASE","DBLINK","PG_SLEEP"];

findComplex.prototype.init = function(){
  this.modelName = this.model.modelName;
  this.datasource = this.model.getDataSource();
  this.connector = this.datasource.connector;
  this.relationData = this.getRelations(this.model.relations);
  this.schema = this.connector.schema(this.modelName);
  this.modelTable = this.datasource.tableName(this.modelName);
  this.modelProperties = this.model.definition.properties;
}


findComplex.prototype.getRelations = function(relations){
  relationData = {}
  for(var relation in relations){
      tmp = {};
      tmp.name  = relations[relation].name;
      tmp.modelTo = relations[relation].modelTo.definition.name;
      tmp.modelToTable = this.connector.schema(tmp.modelTo)+"."+this.datasource.connector.table(tmp.modelTo);
      tmp.keyTo = relations[relation].keyTo;
      tmp.modelToProperties = relations[relation].modelTo.definition.properties;
      tmp.modelFrom = relations[relation].modelFrom.definition.name;
      tmp.modelFromTable = this.connector.schema(tmp.modelFrom)+"."+this.datasource.connector.table(tmp.modelFrom);
      tmp.keyFrom = relations[relation].keyFrom;
      if((relations[relation].type == "hasMany" && typeof relations[relation].modelThrough == 'undefined')
        || relations[relation].type == "belongsTo" || relations[relation].type == "hasOne" ){
        tmp.type = relations[relation].type;
      }
      if(relations[relation].type == "hasMany" && typeof relations[relation].modelThrough != 'undefined'){
        tmp.type = "hasManyThrough";
        tmp.modelThrough = relations[relation].modelThrough.definition.name;
        tmp.modelThroughTable  = this.datasource.connector.schema(tmp.modelThrough)+"."+this.datasource.connector.table(tmp.modelThrough);
        tmp.keyThrough = relations[relation].keyThrough;
      }
      relationData[relations[relation].name] = tmp;

  }
  return relationData;
}


findComplex.prototype.propertyExists = function(property,modelName){
  if(modelName == this.modelName){
    model = this.model;
    properties = this.connector.getModelDefinition(modelName).properties;
    relationData = this.relationData;
  }
  else{
    model = that.model.app.models[modelName];
    properties = this.connector.getModelDefinition(modelName).properties;
    relationData = this.getRelations(model.relations);
  }
  if(properties[property] == null){
    return false;
  }else{
    return true;
  }
}

findComplex.prototype.translateFunc = function(func,parameters,alias,subFunc=false){
  if(func.match(/^[$A-Z_][0-9A-Z_$]*$/i) == null){
    throw new Error(g.f('{{find()}} invalid function name: %s',func));
  }
  switch(func){
    default:
        sql = ParameterizedSQL(func+"(",[]);
        parameters.forEach(function(param,index){
          if(Object.prototype.toString.call(param) === '[object Object]'){
            if(typeof param.property != 'undefined'){
              if(param.property.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                throw new Error(g.f('{{find()}} invalid property name %s, property must start with a letter or underscore, can only contain letters,numbers or underscore',param.property));
              }
              if(typeof param.alias != 'undefined'){
                if(param.alias.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                  throw new Error(g.f('{{find()}} invalid alias name %s, alias must start with a letter or underscore, can only contain letters,numbers or underscore',param.alias));
                }
                sql.sql = sql.sql+","+param.alias+"."+param.property;
              }
              else{
                sql.sql = sql.sql+","+alias+"."+param.property;
              }
            }
            else{
                if(param.constructor.name == 'ParameterizedSQL'){
                  if(index == 0){
                    sql = sql.merge(param,"");
                  }
                  else{
                    sql = sql.merge(param,",");
                  }
                }
            }
          }
          else{
            if(index == 0){
              if(param.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                throw new Error(g.f('{{find()}} invalid property name %s, property must start with a letter or underscore, can only contain letters,numbers or underscore',param));
              }
              sql.sql = sql.sql+alias+"."+param;
            }else{
              tmpsql = ParameterizedSQL(",?",[param]);
              sql = sql.merge(tmpsql,"");
            }
          }
          });
          sql.sql = sql.sql+")";
          break;

    case 'CAST':
          var value   = parameters[0];
          var castTO  = parameters[1].toUpperCase();
          if(this.castTypes.indexOf(castTO) != -1){
            sql = ParameterizedSQL("CAST(? as "+castTO+")",[value]);
          }
          else{
            throw new Error(g.f('{{find()}} invalid cast type %s, valid cast types are: %s',castTO,this.castTypes));
          }
          break;
    case 'CURRENT_DATE':
    case 'CURRENT_TIME':
    case 'CURRENT_TIMESTAMP':
    case 'LOCALTIME':
    case 'LOCALTIMESTAMP':
         sql = ParameterizedSQL(func,[]);
    break;

    case 'NOW':
    case 'TIMEOFDAY':
    case 'CLOCK_TIMESTAMP':
        sql = ParameterizedSQL(func+"()",[]);
    break;
  }
  return sql;
}

findComplex.prototype.buildInClause = function(columnValues){
  var $super = this;
  var values = [];
  columnValues.forEach(function(value,index){
    if (value instanceof ParameterizedSQL) {
      values.push(value);
    }
    else{
      if(Object.prototype.toString.call(value) == "[object Object]"){
        var keys = Object.keys(value);
        var func = keys[0];
        var params = value[func];
        var translated = $super.translateFunc(func,params);
        values.push(translated);
      }
      else{
        values.push(new ParameterizedSQL('?', [value]));
      }
    }
  });
  var clause = ParameterizedSQL.join(values, ',');
  clause.sql = "(" + clause.sql + ")";
  return clause;
}

findComplex.prototype.createCondition = function(data,alias,parentParams,parentFunc,positions,position,level=0){
  that = this;
  moduleCondition = 0;
  var sqlCondition = ParameterizedSQL('',[]);
  var isValue = false;
  var isJson  = false;
  data.forEach(function(field,index){
    if(Object.prototype.toString.call(field) === '[object Array]'){
        if(typeof data[index-1] == "string"){
          prior = data[index-1].toUpperCase();
        }
        else{
          prior = false;
        }
        switch(prior){
          case 'BETWEEN':
          case 'NOT BETWEEN':
            tmp = ParameterizedSQL('? and ?',[field[0],field[1]]);
            sqlCondition = ParameterizedSQL.append(sqlCondition,tmp);
            break;
          case 'IN':
          case 'NOT IN':
            tmp = that.buildInClause(field);
            sqlCondition = ParameterizedSQL.append(sqlCondition,tmp);
            isValue = false;
            break;
          default:
            tmp = that.createCondition(field,alias);
            tmp.sql = "(" + tmp.sql + ")";
            sqlCondition = ParameterizedSQL.append(sqlCondition,tmp);
        }
    }else if(typeof field == 'string'){
        if(index % 2 == moduleCondition && !isValue && !isJson){
          property = field;
          if(property.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
            throw new Error(g.f('{{find()}} invalid property name %s, property must start with a letter or underscore, can only contain letters,numbers or underscore',property));
          }
          sqlCondition.sql = sqlCondition.sql+" "+alias + "." + property;
        }
        else if(index % 2 == moduleCondition && !isValue && isJson){
          property = field;
          if(property.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
            throw new Error(g.f('{{find()}} invalid property name %s, property must start with a letter or underscore, can only contain letters,numbers or underscore',property));
          }
          sqlCondition.sql = sqlCondition.sql +" '"+ property+"' ";
          isJson = false;
        }
        else{
          if(!isValue && that.operators.indexOf(field.toUpperCase()) == -1){
            throw new Error(g.f('{{find()}} invalid operator name %s, valid sql operators: %s',field,that.operators.join(',')));
          }
          else if((field.toUpperCase() == 'AND' || field.toUpperCase() == 'OR') && !isValue){
            logicalOperator = field;
            sqlCondition.sql = sqlCondition.sql+" "+logicalOperator;
            isValue=false;
          }
          else{
            if(that.operators.indexOf(field.toUpperCase()) != -1 && !isValue){
              operator = field.toUpperCase();
              sqlCondition.sql = sqlCondition.sql+" "+operator;
              if(operator == 'IS NULL' || operator == 'NOT NULL' || operator == 'IS FALSE' || operator == 'IS NOT FALSE' || operator == 'IS TRUE' ||
                   operator == 'IS NOT TRUE' || operator == 'IS UNKNOWN' || operator == 'IS NOT UNKNOWN'){
                moduleCondition = (moduleCondition%2 == 0)?1:0;
                isValue = false;
              }
              else if(operator == '->' || operator == '->>' || operator == '?'){
                isValue = false;
                isJson  = true;
              }
              else{
                isValue = true;
              }
            }
            else{
                value = field;
                tmp = ParameterizedSQL("?",[value]);
                sqlCondition = sqlCondition.merge(tmp);
                isValue=false;
            }
          }
        }
      }
      else if(typeof field == 'number'){
        value = field;
        tmp = ParameterizedSQL("?",[value]);
        sqlCondition = sqlCondition.merge(tmp);
        isValue=false;
      }
      else if(Object.prototype.toString.call(field) === '[object Object]'){
          object = field;
          if(field != null){
            if(typeof field.property != 'undefined'){
              if(field.property.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                throw new Error(g.f('{{find()}} invalid property name %s, property must start with a letter or underscore, can only contain letters,numbers or underscore',field.property));
              }
              if(typeof field.alias != 'undefined'){
                if(field.alias.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                  throw new Error(g.f('{{find()}} invalid alias name %s, alias must start with a letter or underscore, can only contain letters,numbers or underscore',field.alias));
                }
                sqlCondition.sql = sqlCondition.sql+" "+field.alias+"."+field.property;
              }
              else{
                sqlCondition.sql = sqlCondition.sql+" "+alias+"."+field.property;
              }
            }
            else{
              for(var subField in object){
                  func = subField.toUpperCase();
                  if(func.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
                    throw new Error(g.f('{{find()}} invalid function name %s, function must start with a letter or underscore, can only contain letters,numbers or underscore',func));
                  }
                  var parameters = object[subField];
                  var subFunc = [];
                  if(level == 0){
                    if(typeof positions == 'undefined'){
                      var positions = parameters.length;
                    }
                  }
                  else{
                    if(level >= 1){
                      var positions = parameters.length;
                      var parentFunc = func;
                    }
                  }
                  if(typeof parentFunc == 'undefined'){
                      parentFunc = func;
                  }
                  var position = 0;
                  parameters.forEach(function(param,index){
                      position += 1;
                      if(Object.prototype.toString.call(param) === '[object Object]' && typeof param.property == 'undefined'){
                           subParams = param;
                           parentParams = parameters;
                           subFunc[index] = that.createCondition([subParams],alias,parentParams,parentFunc,positions,position,level+1);
                           parentParams[index] = subFunc[index];
                      }
                  });
                  tmp = that.translateFunc(parentFunc,parameters,alias,subFunc=false);
                  sqlCondition = sqlCondition.merge(tmp);
            }
          }
        }
    }
  });
  return sqlCondition;
}

findComplex.prototype.sqlSubquery = function(params){
  sql = new ParameterizedSQL('',[]);
  join   = '';
  lateralWhere = '';
  on = '';
  groupBy = '';
  orderBy = '';

  joinType = (params.method == 'LATERAL')?params.joinType+" LATERAL ":params.joinType;
  sql.sql = " "+joinType+" (";

  if(params.method == 'LATERAL'){
    if(params.sublevels == 0){
      on = " ON TRUE";
      switch(params.type){
        case 'hasManyThrough':
            lateralWhere = " WHERE " + params.modelThrough +"."+ params.keyTo +" = "+ params.parentAlias +"."+ params.keyFrom;
            break;
        case 'hasMany':
        case 'hasOne':
        case 'belongsTo':
            lateralWhere = " WHERE "+ params.alias  + "." + params.keyTo + " = " + params.parent_alias + "." + params.keyFrom;
      }
    }
  }
  else{
    if(params.sublevels == 0){
      switch(params.type){
        case 'hasManyThrough':
            on = " ON "+ params.alias +"."+ params.keyTo +" = "+ params.parentAlias +"."+ params.keyFrom;
            break;
        case 'hasMany':
        case 'hasOne':
        case 'belongsTo':
            on = " ON "+ params.alias +"."+ params.keyTo +" = "+ params.parent_alias + "." + params.keyFrom;
      }
    }
  }


  if(params.type == 'hasManyThrough'){
    join   = " INNER JOIN " + params.join_table + " AS " + params.join_alias
           + " ON " + params.join_alias + "." + params.join_foreign_key + " = " + params.alias + "." + params.associationKey;
  }

  if(params.method == "PAGING"){
    if(typeof params.groupBy != 'undefined' && params.groupBy != null){
      params.select = params.groupBy;
    }else{
      params.select = params.alias+"."+params.keyFrom;
    }
  }

  sql.sql = sql.sql +'SELECT '+ params.select +  " FROM " + params.from_table + " AS " + params.alias + join + lateralWhere;

  if(params.where != null && params.sublevels == 0){
      if(params.method == 'LATERAL'){
        sql.sql = sql.sql + " AND ";
        sql = sql.merge(params.where,"");
      }
      else{
        sql.sql = sql.sql + " WHERE ";
        sql = sql.merge(params.where,"");
      }
  }

  if(params.sublevels == 0){
    groupBy = (params.groupBy != null && typeof params.groupBy != 'undefined')?" GROUP BY "+params.groupBy:"";
    orderBy = params.orderBy;
  }

  sql.sql = sql.sql + groupBy;

  if(params.having != null && params.sublevels == 0){
    sql.sql = sql.sql + " HAVING ";
    sql = sql.merge(params.having,"");
  }

  sql.sql = sql.sql + orderBy;

  if(params.sublevels == 0){
    sql.sql = sql.sql+" ) AS "+params.alias +on;
  }
  return sql;
}

findComplex.prototype.translateJoin = function(join,method='LATERAL',parentJoin,firstPass=true){
  that = this;
  var joins = [];
  var mainQuery = new ParameterizedSQL("",[]);

  keys = Object.keys(join);
  keys.forEach(function(alias){
      tmp = join[alias];
      subQuery = new ParameterizedSQL("",[]);
      tmp.forEach(function(subJoin,index){
          if(index == 0){
            subJoin = subJoin["$relation"];
            switch(subJoin.relationData.type){
              case 'hasManyThrough':
                  params = {'select':subJoin.select,
                        'from_table':subJoin.relationData.modelToTable,
                             'alias':subJoin.alias,
                           'groupBy':subJoin.groupBy,
                           'orderBy':subJoin.orderBy,
                        'join_table':subJoin.relationData.modelThroughTable,
                        'join_alias':subJoin.relationData.modelThrough,
                  'join_foreign_key':subJoin.relationData.keyThrough,
                    'associationKey':subJoin.relationData.keyFrom,
                      'modelThrough':subJoin.relationData.modelThrough,
                             'keyTo':subJoin.relationData.keyTo,
                       'parentAlias':subJoin.parentAlias,
                           'keyFrom':subJoin.relationData.keyFrom,
                             'where':subJoin.where,
                            'having':subJoin.having,
                          'joinType':subJoin.joinType,
                         'sublevels':subJoin.sublevels,
                              'type':subJoin.relationData.type,
                            'method':method}
                  subQuery = that.sqlSubquery(params);
                  break;
              case 'hasMany':
              case 'hasOne':
              case 'belongsTo':
                  params = {
                        'select':subJoin.select,
                         'alias':subJoin.alias,
                    'from_table':subJoin.relationData.modelToTable,
                      'joinType':subJoin.joinType,
                  'parent_alias':subJoin.parentAlias,
                       'keyFrom':subJoin.relationData.keyFrom,
                         'keyTo':subJoin.relationData.keyTo,
                          'type':subJoin.relationData.type,
                     'sublevels':subJoin.sublevels,
                       'groupBy':subJoin.groupBy,
                       'orderBy':subJoin.orderBy,
                         'where':subJoin.where,
                        'having':subJoin.having,
                        'method':method
                  }
                subQuery = that.sqlSubquery(params);
                break;
            } /* END SWITCH RELATION TYPE */
            mainQuery = mainQuery.merge(subQuery,"");
          } /* END IF index == 0 */
          else{
            mainQuery = mainQuery.merge(that.translateJoin(subJoin,method,join[alias][0]["$relation"],false),"");
          }
      });
      closeJoin = join[alias][0]["$relation"];
      if(closeJoin.parentJoin.sublevels == closeJoin.sublevel+1 && closeJoin.level != 1){
        tmpJoin = closeJoin.parentJoin;
        tmpParentJoin = closeJoin.parentJoin.parentJoin;
        if(method == "LATERAL") {
          if(tmpJoin.relationData.type == "hasManyThrough"){
            mainQuery.sql = mainQuery.sql +" WHERE "+ tmpJoin.relationData.modelThrough+"."+tmpJoin.relationData.keyTo + " = "
            +tmpParentJoin.alias +"."+ tmpJoin.relationData.keyFrom;
          }else{
            mainQuery.sql = mainQuery.sql + " WHERE " + tmpJoin.alias+"."+tmpJoin.relationData.keyTo + " = "
            +tmpParentJoin.alias+"."+tmpJoin.relationData.keyFrom;
          }

          if(closeJoin.where != null){
            mainQuery.sql = mainQuery.sql + " AND ";
            mainQuery = mainQuery.merge(closeJoin.where,"");
          }
        }
        else{
          if(closeJoin.where != null){
            mainQuery.sql = mainQuery.sql + " WHERE ";
            mainQuery = mainQuery.merge(closeJoin.where,"");
          }
        }
        if(closeJoin.parentJoin.groupBy != null) mainQuery.sql = mainQuery.sql + " GROUP BY "+closeJoin.parentJoin.groupBy;
        if(closeJoin.having != null){
          mainQuery.sql = mainQuery.sql + " HAVING ";
          mainQuery = mainQuery.merge(closeJoin.having,"");
        }
        if(method == "LATERAL"){
          mainQuery.sql = mainQuery.sql + tmpJoin.orderBy + tmpJoin.offset + tmpJoin.limit + " )" + " AS " + tmpJoin.alias + " ON TRUE";
        }
        else{
          mainQuery.sql = mainQuery.sql + tmpJoin.orderBy + tmpJoin.offset + tmpJoin.limit + " )" + " AS " + tmpJoin.alias + " ON "+ tmpJoin.alias +"."+ tmpJoin.relationData.keyTo + " = " +
                         tmpJoin.parentAlias + "." +tmpJoin.relationData.keyFrom;
        }

      }
      else if(closeJoin.level == 0){
        if(closeJoin.sublevels > 0){
          if(method == "LATERAL"){
            if(closeJoin.relationData.type == "hasManyThrough"){
              mainQuery.sql = mainQuery.sql +" WHERE "+ closeJoin.relationData.modelThrough+"."+closeJoin.relationData.keyTo + " = "
              +closeJoin.parentAlias +"."+ closeJoin.relationData.keyFrom;
            }else{
              mainQuery.sql = mainQuery.sql +" WHERE "+ closeJoin.alias+"."+closeJoin.relationData.keyTo + " = "
              +closeJoin.relationData.modelFrom+"."+closeJoin.relationData.keyFrom;
            }
            if(closeJoin.where != null){
              mainQuery.sql = mainQuery.sql + " AND ";
              mainQuery = mainQuery.merge(closeJoin.where,"");
            }
          }
          else{
            if(closeJoin.where != null){
              mainQuery.sql = mainQuery.sql + " WHERE ";
              mainQuery = mainQuery.merge(closeJoin.where,"");
            }
          }
          if(closeJoin.groupBy != null) mainQuery.sql = mainQuery.sql + " GROUP BY "+closeJoin.groupBy;
          if(closeJoin.having != null){
            mainQuery.sql = mainQuery.sql + " HAVING ";
            mainQuery = mainQuery.merge(closeJoin.having,"");
          }
          if(method == "LATERAL"){
            mainQuery.sql = mainQuery.sql + closeJoin.orderBy + closeJoin.offset + closeJoin.limit + " )" + " AS " + closeJoin.alias + " ON TRUE ";
          }
          else{
            mainQuery.sql = mainQuery.sql + closeJoin.orderBy + closeJoin.offset + closeJoin.limit  + " )" + " AS " + closeJoin.alias + " ON "+
            closeJoin.alias+"."+closeJoin.relationData.keyTo+ " = " + closeJoin.relationData.modelFrom+"."+closeJoin.relationData.keyFrom;
          }
          }
        joins.push({"sqlQuery":mainQuery,"data":closeJoin});
        mainQuery = new ParameterizedSQL("",[]);
      }
    });
  if(firstPass){
    return joins;
  }else{
    return mainQuery;
  }

}

findComplex.prototype.createJoinSelect = function(join,childs){
  var select = []
  var sqlSelect = "";
  model = this.model.app.models[join.relationData.modelTo];
  relationData = this.getRelations(model.relations);
  childKeys = Object.keys(childs);

  if(typeof join.select == 'undefined'){
      for(var property in join.relationData.modelToProperties){
        if(join.relationData.modelToProperties[property].hidden != true) select.push(property)
      }
  }
  else{
      if(typeof join.select.include != 'undefined'){
        join.select.include.forEach(function(property){
        if(typeof join.relationData.modelToProperties[property] != 'undefined'){
          if(join.relationData.modelToProperties[property].hidden != true) select.push(property)
        }
        else{
          throw new Error(g.f('{{find()}} Property %s of model %s relation %s don\'t exists ',property,join.relationData.modelTo,join.relation));
        }
        });
      }
      else if(typeof join.select.exclude != 'undefined'){
          tmpSelect = []
          for(var property in join.relationData.modelToProperties){
            if(join.relationData.modelToProperties[property].hidden != true) tmpSelect.push(property)
          }
          join.select.exclude.forEach(function(property){
            if(typeof join.relationData.modelToProperties[property] != 'undefined'){
              removeIndex = tmpSelect.indexOf(property);
              if(removeIndex > -1) tmpSelect = tmpSelect.splice(removeIndex,1);
            }
          });
          select = tmpSelect;
      }
  }

  tmpSelect = [];
  select.forEach(function(property){
    tmpSelect.push("'"+property+"',"+ join.alias+"."+property);
  });

  childKeys.splice(0,1);
  childKeys.forEach(function(alias){
      if(childs[alias]['$relation'].select !== false){
      switch(relationData[alias].type){
        case 'hasOne':
        case 'belongsTo':
          tmpSelect.push("'"+alias+"',"+" CASE WHEN "+alias+"."+alias+" IS NULL THEN json_build_object() ELSE "+alias+"."+alias+ " END ");
          break;
        case "hasMany":
        case "hasManyThrough":
          tmpSelect.push("'"+alias+"',"+" CASE WHEN "+alias+"."+alias+" IS NULL THEN json_build_array() ELSE "+alias+"."+alias+ " END ");
          break;
      }
      }
  });

  if(join.select !== false){
  sqlSelect = "json_build_object("+tmpSelect.join(',')+")";
  switch(join.relationData.type){
    case 'hasMany':
        sqlSelect = "json_agg("+sqlSelect+") AS "+join.alias;
        if(join.level > 0) sqlSelect = sqlSelect +","+ join.alias +"."+ join.relationData.keyTo +" AS "+ join.relationData.keyTo;
        break;
    case 'hasManyThrough':
        sqlSelect = "json_agg("+sqlSelect+") AS "+join.alias;
        if(join.level > 0) sqlSelect = sqlSelect +","+ join.relationData.modelThrough +"."+ join.relationData.keyTo +" AS "+ join.relationData.keyTo;
        break;
    case 'hasOne':
    case 'belongsTo':
        sqlSelect = sqlSelect+" AS "+join.alias;
        if(join.level > 0) sqlSelect = sqlSelect +","+ join.alias +"."+ join.relationData.keyTo +" AS "+ join.relationData.keyTo;
  }
  }
  else{
    sqlSelect = join.alias + "." + join.relationData.keyTo;
  }
  return sqlSelect;
}

findComplex.prototype.createMainSelect = function(data){
  that = this;
  var tmpSelect = []
  if(Object.prototype.toString.call(data) !== '[object Object]' && typeof data != 'undefined'){
    throw new Error(g.f('{{find()}} select must be of type Object, %s given',JSON.stringify(data)));
  }
  else{
    if(typeof data == 'undefined'){
      for(var property in that.modelProperties){
        if(that.modelProperties[property].hidden != true) tmpSelect.push(property)
      }
    }
    else{
      if(typeof data.include != 'undefined'){
        data.include.forEach(function(property){
        if(typeof that.modelProperties[property] != 'undefined'){
          if(that.modelProperties[property].hidden != true) tmpSelect.push(property)
        }
        else{
          throw new Error(g.f('{{find()}} Property %s of model %s don\'t exists ',property,that.modelName));
        }
        });
      }
      else{
        if(typeof data.exclude != 'undefined'){
          tmpSelect = []
          for(var property in that.modelProperties){
            if(that.modelProperties[property].hidden != true) tmpSelect.push(property)
          }
          data.exclude.forEach(function(property){
            if(typeof that.modelProperties[property] != 'undefined'){
              removeIndex = tmpSelect.indexOf(property);
              if(removeIndex > -1) tmpSelect = tmpSelect.splice(removeIndex,1);
            }
          });
        }
      }
    }

    select = [];
    size = tmpSelect.length;
    tmpSelect.forEach(function(property){
        select.push(that.modelName +"."+property);
    });
  }
  return "SELECT "+select.join(',');
}

findComplex.prototype.createOrderBy = function(join){
  that = this;
  orderBy = []
    if(typeof join.orderBy != 'undefined' && join.orderBy != null){
      join.orderBy.forEach(function(object){
        for(var property in object){
          sort = object[property].toUpperCase();
          if(that.sortOrder.indexOf(sort) == -1){
            throw new Error(g.f('{{find()}} Sort order %s in OrderBy for property %s in relation %s is invalid, valid values are ASC,DESC,NULLS FIRST,NULLS LAST ',sort,property,join.relation));
          }
          if(typeof join.relationData.modelToProperties[property] != 'undefined'){
            orderBy.push(join.alias+"."+property+" "+sort);
          }
          else{
            throw new Error(g.f('{{find()}} Property %s in OrderBy for model %s don\'t exists',property,join.relationData.modelTo));
          }
        }
      });
    }else{
      switch(join.relationData.type){
        case "hasOne":
          orderBy.push(join.alias+"."+join.relationData.keyFrom+" ASC");
          break;
        case "belongsTo":
        case "hasMany":
          orderBy.push(join.alias+"."+join.relationData.keyTo+" ASC");
          break;
      }

    }

    switch(join.relationData.type){
      case "belongsTo":
      case "hasOne":
        join.orderBy = " ORDER BY "+orderBy.join(",");
        break;
      case "hasManyThrough":
        if(typeof join.orderBy != 'undefined'){
          join.relationData.modelToTable = "(select * from "+join.relationData.modelToTable+" AS "+join.alias
          +" ORDER BY "+orderBy.join(",")+")";
          join.orderBy = " ORDER BY "+join.relationData.modelThrough +"."+ join.relationData.keyTo + " ASC ";
        }else{
          join.orderBy = " ORDER BY "+join.relationData.modelThrough +"."+ join.relationData.keyTo + " ASC ";
        }
        break;
      case "hasMany":
        if(typeof join.orderBy != 'undefined'){
          join.relationData.modelToTable = "(select * from "+join.relationData.modelToTable+" AS "+join.alias
          +" ORDER BY "+orderBy.join(",")+")";
          join.orderBy = "";
        }else{
          join.orderBy = " ORDER BY "+orderBy.join(",");
        }
        break;
    }
  return join;
}

findComplex.prototype.createGroupBy = function(join){
    groupBy = [];
    switch(join.relationData.type){
      case 'hasMany':
        groupBy.push(join.alias+"."+join.relationData.keyTo);
        break;
      case "hasManyThrough":
        groupBy.push(join.relationData.modelThrough+"."+join.relationData.keyTo);
        break;
    }
    if(groupBy.length != 0){
      return groupBy.join(',');
    }
    else{
      return null;
    }
}

findComplex.prototype.createJoins = function(include,modelName,firstPass=true,parentAlias=null,level,sublevel=0){
  that = this;
  var joinData={};
  if(modelName == this.modelName){
    model = this.model;
    properties = this.connector.getModelDefinition(modelName).properties;
    relationData = this.relationData;
  }
  else{
    model = this.model.app.models[modelName];
    properties = this.connector.getModelDefinition(modelName).properties;
    relationData = this.getRelations(model.relations);
  }
  keys = Object.keys(include);
  keys.forEach(function(alias,index){
      if(alias.match(/^[A-Z_a-z][0-9A-Z_]*$/i) == null){
        throw new Error(g.f('{{find()}} invalid alias name %s, alias must start with a letter or underscore, can only contain letters,numbers or underscore',alias));
      }
      if(firstPass == true){
        level = 0;
        if(index == 0){
          parentAlias = modelName;
          backRelationData = relationData;
        }
        else{
          modelName = parentAlias;
          relationData = backRelationData;
          sublevel = 0;
        }
        subData = include[alias];
      }
      else{
        level += 1;
        subData = include[alias];
      }
      subData = include[alias];
      for(var subAlias in subData){

        if(subAlias == '$relation'){
          join = {};
          if(firstPass){
            join.parentJoin = subData[subAlias];
          }
          else{
            join.parentJoin = subData["$relation"]["parentJoin"];
          }
          join.alias=alias;
          join.parentAlias = parentAlias;
          join.relation = subData[subAlias].name;
          join.relationData = relationData[join.relation];
          if(typeof join.relationData == 'undefined'){
            throw new Error(g.f('{{find()}} Relation %s of model %s dont\'t exists ',join.relation,modelName));
          }
          if(typeof subData[subAlias].joinType != 'undefined'){
            joinType = subData[subAlias].joinType.toUpperCase();
            if(that.joinTypes.indexOf(joinType) != -1){
              join.joinType = joinType;
            }
            else{
              throw new Error(g.f('{{find()}} invalid join type %s, for alias %s,relation %s',joinType,alias,join.relation));
            }
          }
          else{
            join.joinType = "LEFT JOIN";
          }
          join.level = level;
          join.sublevel = sublevel;
          join.sublevels = Object.keys(subData).length -1;
          join.select = subData[subAlias].select;
          join.ignore = (join.select === false)?true:false;
          join.select = that.createJoinSelect(join,subData);
          join.orderBy = subData[subAlias].orderBy;
          join = that.createOrderBy(join);
          join.groupBy = that.createGroupBy(join);
          if((Object.prototype.toString.call(subData[subAlias].having) == "[object Array]")?subData[subAlias].having.length != 0:false){
            join.having = that.createCondition(subData[subAlias].having,alias);
          }else {
            join.having = null;
          }
          var where = subData[subAlias].where;
          if((Object.prototype.toString.call(where) == "[object Array]")?where.length != 0:false){
            tmpWhere = that.createCondition(where,alias);
            tmpWhere.sql = "("+tmpWhere.sql+")";
            join.where = tmpWhere;
          }else {
            join.where = null;
          }
          join.limit  = subData[subAlias].limit;
          join.offset = subData[subAlias].offset;
          if(typeof join.limit != 'undefined' && typeof join.limit != 'number'){
            throw new Error(g.f('{{find()}} Invalid limit value %s, limit must be a number',join.limit));
          }
          if(typeof join.offset != 'undefined' && typeof join.offset != 'number'){
            throw new Error(g.f('{{find()}} Invalid offset value %s, offset must be a number',join.offset));
          }
          join.limit  = (typeof join.limit != 'undefined')?" LIMIT "+join.limit:"";
          join.offset = (typeof join.offset != 'undefined')?" OFFSET "+join.offset:"";
          modelName = join.relationData.modelTo;
          if(typeof joinData[alias] == 'undefined'){
            joinData[alias] = [];
          }
          joinData[alias].push({"$relation":join});
          sublevel = 0;
        }
        else{
          var childData = {};
          childData[subAlias] = include[alias][subAlias];
          childData[subAlias]["$relation"]["parentJoin"] = joinData[alias][0]["$relation"];
          if(typeof joinData[alias] == 'undefined')  joinData[alias] = [];
          joinData[alias].push(that.createJoins(childData,modelName,false,alias,level,sublevel));
          sublevel += 1;
        }
      }
  });
  return joinData;
}

findComplex.prototype.generateQuery = function(select,where,order,offset,limit,joinSqls,pagingSql){
  that = this;
  mainSql = new ParameterizedSQL("",[]);
  orderBy = [];
  pKeys = this.model.definition.ids();
  pKeys.forEach(function(pkey){
    orderBy.push(that.modelName+"."+pkey.name+" ASC");
  });
  orderBy = " ORDER BY "+orderBy.join(",");

  mainSql.sql = this.createMainSelect(select);
  joinSqls.forEach(function(join){
    if(join.data.ignore != true){
      mainSql.sql = mainSql.sql + "," + join.data.alias + "." + join.data.alias + " AS " + join.data.alias;
    }
  });
  mainSql.sql = mainSql.sql + " from "+this.schema+"."+this.modelTable+" AS " + this.modelName;
  joinSqls.forEach(function(join){
    mainSql = mainSql.merge(join.sqlQuery,"");
  });

  if(typeof order != 'undefined' && order != null){
    orderBy = [];
    order.forEach(function(object){
      for(var property in object){
        sort = object[property].toUpperCase();
        if(that.sortOrder.indexOf(sort) == -1){
          throw new Error(g.f('{{find()}} Sort order %s in OrderBy for property %s in model %s is invalid, valid values are ASC,DESC,NULLS FIRST,NULLS LAST ',sort,property,that.modelName));
        }
        if(typeof that.modelProperties[property] != 'undefined'){
          orderBy.push(property+" "+sort);
        }
        else{
          throw new Error(g.f('{{find()}} Property %s of model %s don\'t exists ',property,that.modelName));
        }
      }
    });
    orderBy = " ORDER BY "+orderBy.join(",");
  }

  if(pagingSql == null){
    if(typeof offset == 'number'){
      offset = " OFFSET "+offset;
    } else { offset = "" }

    if(typeof limit == "number"){
      limit = " LIMIT "+limit;
    } else { limit = "" }
  }else{
      offset = "";
      limit  = "";
  }

  if(typeof where != 'undefined' && (Object.prototype.toString.call(where) == "[object Array]")?where.length != 0:false){
    where = this.createCondition(where,this.modelName);
    mainSql.sql = mainSql.sql+" WHERE ";
    mainSql = mainSql.merge(where,"");
    if(pagingSql != null){
      mainSql.sql = mainSql.sql+" AND ";
      mainSql = mainSql.merge(pagingSql,"");
    }
  }
  else if(pagingSql != null){
    mainSql.sql = mainSql.sql+" WHERE ";
    mainSql = mainSql.merge(pagingSql,"");
  }
  mainSql.sql = mainSql.sql + orderBy + offset + limit;
  return mainSql;
}

findComplex.prototype.pagingQuery = function(pagingJoins,where,order,offset,limit){
  that = this;
  pagingSql = new ParameterizedSQL("",[]);
  orderBy = [];
  pKeySelect = [];
  pKeys = this.model.definition.ids();
  pKeys.forEach(function(pkey){
    pKeySelect.push(that.modelName+"."+pkey.name);
    orderBy.push(that.modelName+"."+pkey.name+" ASC");
  })
  orderBy = " ORDER BY "+orderBy.join(",");

  pagingSql.sql = pKeySelect[0]+" IN (SELECT "+pKeySelect[0]+" FROM "+this.schema+"."+this.modelTable+" AS "+this.modelName;
  pagingJoins.forEach(function(pagingJoin){
    pagingSql = pagingSql.merge(pagingJoin.sqlQuery,"");
  });

  if(typeof where != 'undefined' && (Object.prototype.toString.call(where) == "[object Array]")?where.length != 0:false){
    where = this.createCondition(where,this.modelName);
    pagingSql.sql = pagingSql.sql+" WHERE ";
    pagingSql = pagingSql.merge(where,"");
  }

  if(typeof order != 'undefined' && (Object.prototype.toString.call(order) == "[object Array]")?order.length != 0:false){
    orderBy = [];
    order.forEach(function(object){
      for(var property in object){
        sort = object[property].toUpperCase();
        if(that.sortOrder.indexOf(sort) == -1){
          throw new Error(g.f('{{find()}} Sort order %s in OrderBy for property %s in model %s is invalid, valid values are ASC,DESC,NULLS FIRST,NULLS LAST ',sort,property,that.modelName));
        }
        if(typeof that.modelProperties[property] != 'undefined'){
          orderBy.push(property+" "+sort);
        }
        else{
          throw new Error(g.f('{{find()}} Property %s of model %s don\'t exists ',property,that.modelName));
        }
      }
    });
    orderBy = " ORDER BY "+orderBy.join(",");
  }
  pagingSql.sql = pagingSql.sql+orderBy+" OFFSET "+offset+" LIMIT "+limit+" )";
  return pagingSql;
}

findComplex.prototype.counterQuery = function(counterJoins,where){
  that = this;
  counterSql = new ParameterizedSQL("",[]);
  counterSql.sql = "SELECT count("+this.modelName+") as count FROM "+this.schema+"."+this.modelTable+" AS "+this.modelName;
  counterJoins.forEach(function(counterJoin){
    counterSql = counterSql.merge(counterJoin.sqlQuery,"");
  });


  if((Object.prototype.toString.call(where) == "[object Array]")?where.length != 0:false){
    where = this.createCondition(where,this.modelName);
    counterSql.sql = counterSql.sql+" WHERE ";
    counterSql = counterSql.merge(where,"");
  }
  return counterSql;
}

findComplex.prototype.find = function(filter,cb,onlyOne=false){
  var joinSqls = [];
  var pagingSql = null;


  if(typeof filter.limit != 'undefined' && typeof filter.limit != 'number' && filter.limit !== null){
    throw new Error(g.f('{{find()}} Invalid limit value %s, limit must be a number',filter.limit));
  }
  if(typeof filter.offset != 'undefined' && typeof filter.offset != 'number' && filter.offset !== null){
    throw new Error(g.f('{{find()}} Invalid offset value %s, offset must be a number',filter.offset));
  }


  if(typeof filter.include != 'undefined' && (Object.prototype.toString.call(filter.include) == "[object Object]")){
      include = this.createJoins(filter.include,this.modelName);
      joinSqls = this.translateJoin(include);
      if(typeof filter.offset == 'number'){
        pagingJoins = this.translateJoin(include,'PAGING');
        pagingSql = this.pagingQuery(pagingJoins,filter.where,filter.order,filter.offset,filter.limit);
      }
  }

  mainSql = this.generateQuery(filter.select,filter.where,filter.order,filter.offset,filter.limit,joinSqls,pagingSql);
  sql = this.datasource.connector.parameterize(mainSql);
  this.datasource.connector.execute(sql.sql,sql.params,function(error,data){
          if(onlyOne) data = (data != null)?data[0]:null;
          cb(error,data);
  });
}

findComplex.prototype.count = function(filter,cb){
    counterJoins = [];
    if(Object.prototype.toString.call(filter.include) == "[object Object]"){
      include = this.createJoins(filter.include,this.modelName);
      counterJoins = this.translateJoin(include,'PAGING');
     }
    counterSql = this.counterQuery(counterJoins,filter.where);
    sql = this.datasource.connector.parameterize(counterSql);
    this.datasource.connector.execute(sql.sql,sql.params,function(error,data){
        cb(error,(data != null)?data[0].count:null);
    });
}
