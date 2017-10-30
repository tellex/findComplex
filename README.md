# findComplex
A loopback postgresql model find extension to perform complex queries, related models inner,left,right joins with complex where,having and order conditions, compiled in one big sql query using postgresql >= 9.2 new json functions to perform model relations serialization directly on postgres.

Requirements are postgresql >= 9.2.
To install create a new directory "custom" in your root loopback installation and copy findComplex.js, then add 01-find.js to /server/boot  

Inside 01-find.js can specify wich models to include or exclude findComplex method.
include = [] can be empty in wich case findComplex method will be added to all postgresql models. 
Example include=["users","teams"]
exclude = [] wich models to exclude can be used in combination of an empty include = [] 

Related models include new syntaxsis:

I didn't like loopback way of defining relations, specially when dealing with many models in multiple levels of deept.
Example:
create an object include = {};
then 
include["alias for your results"] = {'$relation':{'name':'name of the relation','joinType':'INNER JOIN or LEFT JOIN or RIGHT JOIN',orderBy:[{'property':'ORDER DIRECTION ASC OR DESC'}...], where:[VALID WHERE CONDITION],having:[VALID HAVING CONDITION],select:{include:[],exclude:[]}}

Example using the classic movie rental database:

includes["rental"] = {'$relation':{name:'rental',joinType:'inner join',orderBy:[{'rental_id':'ASC'}]}};

includes["rental"]["staff"] = {'$relation':{name:'staff',joinType:'left join',orderBy:[{'staff_id':'ASC'}]}};

includes["rental"]["staff"]["store"] = {'$relation':{name:'store',joinType:'left join',orderBy:[{'store_id':'ASC'}]}};

includes["rental"]["payment"] = {'$relation':{name:'payment',joinType:'inner join',orderBy:[{'payment_id':'ASC'}]}};

includes["rental"]["inventory"] = {'$relation':{name:'inventory',joinType:'left join',orderBy:[{'inventory_id':'ASC'}]}};

includes["rental"]["inventory"]["film"] = {'$relation':{name:'film',joinType:'left join',orderBy:[{'film_id':'ASC'}]}};

includes["rental"]["inventory"]["film"]["filmActor"] = {'$relation':{name:'filmActor',joinType:'left join',orderBy:[{'actor_id':'ASC'}]}};

includes["address"] = {'$relation':{name:'address',joinType:'left join'}};

Valid alias names are the same regex as valid javascript functions, this come handy to query multiple results in one query.


VALID WHERE CONDITIONS
I changed where condition syntaxis, with one more intuitive allowing postgresql functions of any deept:

rental example where filter:
 WHERE = [ 'order_date' , '>=' , '2017-08-12' , 'AND' , {substr:['barcode',1,3]} , '!=' , 'EU' , 'OR' ,[ 'order_date' , 'between' , [ '2017-07-10' , '2017-07-15' ], 'AND' , {substr:['barcode',1,2]}, '=' , 'EU' ], 'OR' ,[ 'order_date' , 'between' , ['2017-05-10','2017-06-15'], 'AND' , {substr:['barcode',1,2]}, '=' , 'US' ]],
 
 generates this sql:
 rental.order_date >= '2017-08-12' and substr(rental.barcode,1,2) != 'EU' or (rental.order_date between ('2017-07-10',2017-07-15) and substr(rental.barcode,1,2) = 'EU') or (rental.order_date between ('2017-05-10',2017-06-15) and substr(rental.barcode,1,2) = 'US')
 
 So [] is equal to () sql, is the same as writing plain sql but in an array separated with commas, where the value to the left of an sql operator corresponds to a property of the model if the value is an string, when the value is to the right of sql operator and if is of type string,number or array correspond to a parameterized sql value
In both cases if the value is an object:
valid objects are:

{'postresql_function_name':[parameters]}
{'property':'model property'}
{'property':'model property','alias':'alias defined in include'}

example:
Relation payment:
where = ['payment_date','=',{'alias':'rental','property':'rental_date'}]

postgresql function name has the same regex as a valid javascript function name to avoid sql injection, can be native postgresql or user functions.
Banned function names are:
["SELECT","INSERT","DELETE","CREATE","UPDATE","ALTER","DROP","FOR","EACH","ROW","BEGGIN","END","COMMIT","ROLLBACK","SAVEPOINT","OVER","PATITION","FROM","WINDOW","FUNCTION","GRANT","REVOKE"];
WORDS PROPERTY, ALIAS are reserved, custom sql function with that name will be ignored.

valid function parameters:
The first function parameter if of type string correspond to a model property, or it can be of type object {property:'name','alias':'etc'} the rest of the parameters values are parameterized with the exception of objects {property:'name',alias:'etc'} or {function_name:[parameters]}.
Functions can be anidated to any level of deep.

Keep in mind that the only way to achieve model relation serialization in one query, is the use of subquerys with joins. So is not possible to reference a where condition to a model "alias" that is more than one level below the relation, or reference a model alias that is not directly related.

Example:
['rental']['staff'] 
where in staff can reference to rental alias.
['rental']['staff']['store']
where in store can reference to staff but cannot to rental
where in staff cannot reference to model alias store

*valid sql operators = '=','!=','>','>=','<','<=','BETWEEN','NOT BETWEEN','IN','NOT IN','LIKE','NOT LIKE','ILIKE','NOT ILIKE','IS NULL','IS NOT NULL','IS FALSE','IS NOT FALSE','IS TRUE','IS NOT TRUE','IS UNKNOWN','IS NOT UNKNOWN','SIMILAR TO','NOT SIMILAR TO' 

HAVING:
valid having condition are the same as where condition.

If orderBy is not specified then depending of the relation type a foreignKey or primaryKey is choosed to ensure valid pagination.

SELECT:
valid values:

if select is not defined then all properties are included in the select.
select:null -> Perform sql join but ignore the model serialization in the result.
select:{'include':[],'exclude':[]}
if exclude is defined then all properties are included with exception to the one listed in exclude.
if include is defined only the properties listed are included.


 
 
 
 

