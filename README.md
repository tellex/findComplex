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

includes = {}; 

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


Performance.

When the number of related models is high findComplex is faster than loopback find, because only one query is needed:

Example:
customers: 599 records,
rental: 16044 records,
staff: 2 records,
store: 2 records,
payment: 14596 records,
inventory: 4581 records,
films: 1000 records,
film_actor: 5432 records
Running on a i5 3ghz, sata 7200 rpm disc.

The above rental includes generates the following query for 10 results offset 350, taking 73ms 704kb of data returned:

SELECT customer.customer_id,customer.store_id,customer.first_name,customer.last_name,customer.email,customer.address_id,customer.activebool,customer.create_date,customer.last_update,customer.active,rental.rental AS rental,address.address AS address from public.customer AS customer INNER JOIN LATERAL  (SELECT json_agg(json_build_object('rental_id',rental.rental_id,'rental_date',rental.rental_date,'inventory_id',rental.inventory_id,'customer_id',rental.customer_id,'return_date',rental.return_date,'staff_id',rental.staff_id,'last_update',rental.last_update,'staff', CASE WHEN staff.staff IS NULL THEN json_build_object() ELSE staff.staff END ,'payment', CASE WHEN payment.payment IS NULL THEN json_build_array() ELSE payment.payment END ,'inventory', CASE WHEN inventory.inventory IS NULL THEN json_build_object() ELSE inventory.inventory END )) AS rental FROM (select * from public.rental AS rental ORDER BY rental.rental_id ASC) AS rental LEFT JOIN LATERAL  (SELECT json_build_object('staff_id',staff.staff_id,'first_name',staff.first_name,'last_name',staff.last_name,'address_id',staff.address_id,'email',staff.email,'store_id',staff.store_id,'active',staff.active,'username',staff.username,'password',staff.password,'last_update',staff.last_update,'store', CASE WHEN store.store IS NULL THEN json_build_object() ELSE store.store END ) AS staff,staff.staff_id AS staff_id FROM public.staff AS staff LEFT JOIN LATERAL  (SELECT json_build_object('store_id',store.store_id,'manager_staff_id',store.manager_staff_id,'address_id',store.address_id,'last_update',store.last_update) AS store,store.store_id AS store_id FROM public.store AS store WHERE store.store_id = staff.store_id ORDER BY store.store_id ASC ) AS store ON TRUE WHERE staff.staff_id = rental.staff_id ORDER BY staff.staff_id ASC ) AS staff ON TRUE INNER JOIN LATERAL  (SELECT json_agg(json_build_object('payment_id',payment.payment_id,'customer_id',payment.customer_id,'staff_id',payment.staff_id,'rental_id',payment.rental_id,'amount',payment.amount,'payment_date',payment.payment_date)) AS payment,payment.rental_id AS rental_id FROM (select * from public.payment AS payment ORDER BY payment.payment_id ASC) AS payment WHERE payment.rental_id = rental.rental_id GROUP BY payment.rental_id ) AS payment ON TRUE LEFT JOIN LATERAL  (SELECT json_build_object('inventory_id',inventory.inventory_id,'film_id',inventory.film_id,'store_id',inventory.store_id,'last_update',inventory.last_update,'film', CASE WHEN film.film IS NULL THEN json_build_object() ELSE film.film END ) AS inventory,inventory.inventory_id AS inventory_id FROM public.inventory AS inventory LEFT JOIN LATERAL  (SELECT json_build_object('film_id',film.film_id,'title',film.title,'description',film.description,'release_year',film.release_year,'language_id',film.language_id,'rental_duration',film.rental_duration,'rental_rate',film.rental_rate,'length',film.length,'replacement_cost',film.replacement_cost,'rating',film.rating,'last_update',film.last_update,'special_features',film.special_features,'fulltext',film.fulltext,'filmActor', CASE WHEN filmActor.filmActor IS NULL THEN json_build_array() ELSE filmActor.filmActor END ) AS film,film.film_id AS film_id FROM public.film AS film LEFT JOIN LATERAL  (SELECT json_agg(json_build_object('actor_id',filmActor.actor_id,'film_id',filmActor.film_id,'last_update',filmActor.last_update)) AS filmActor,filmActor.film_id AS film_id FROM (select * from public.film_actor AS filmActor ORDER BY filmActor.actor_id ASC) AS filmActor WHERE filmActor.film_id = film.film_id GROUP BY filmActor.film_id ) AS filmActor ON TRUE WHERE film.film_id = inventory.film_id ORDER BY film.film_id ASC ) AS film ON TRUE WHERE inventory.inventory_id = rental.inventory_id ORDER BY inventory.inventory_id ASC ) AS inventory ON TRUE WHERE rental.customer_id = customer.customer_id GROUP BY rental.customer_id ) AS rental ON TRUE  LEFT JOIN LATERAL  (SELECT json_build_object('address_id',address.address_id,'address',address.address,'address2',address.address2,'district',address.district,'city_id',address.city_id,'postal_code',address.postal_code,'phone',address.phone,'last_update',address.last_update) AS address FROM public.address AS address WHERE address.address_id = customer.address_id ORDER BY address.address_id ASC ) AS address ON TRUE WHERE customer.customer_id IN (SELECT customer.customer_id FROM public.customer AS customer INNER JOIN (SELECT rental.customer_id FROM (select * from public.rental AS rental ORDER BY rental.rental_id ASC) AS rental LEFT JOIN (SELECT staff.staff_id FROM public.staff AS staff LEFT JOIN (SELECT store.store_id FROM public.store AS store ORDER BY store.store_id ASC ) AS store ON store.store_id = staff.store_id ORDER BY staff.staff_id ASC ) AS staff ON staff.staff_id = rental.staff_id INNER JOIN (SELECT payment.rental_id FROM (select * from public.payment AS payment ORDER BY payment.payment_id ASC) AS payment GROUP BY payment.rental_id ) AS payment ON payment.rental_id = rental.rental_id LEFT JOIN (SELECT inventory.inventory_id FROM public.inventory AS inventory LEFT JOIN (SELECT film.film_id FROM public.film AS film LEFT JOIN (SELECT filmActor.film_id FROM (select * from public.film_actor AS filmActor ORDER BY filmActor.actor_id ASC) AS filmActor GROUP BY filmActor.film_id ) AS filmActor ON filmActor.film_id = film.film_id ORDER BY film.film_id ASC ) AS film ON film.film_id = inventory.film_id ORDER BY inventory.inventory_id ASC ) AS inventory ON inventory.inventory_id = rental.inventory_id GROUP BY rental.customer_id ) AS rental ON rental.customer_id = customer.customer_id LEFT JOIN (SELECT address.address_id FROM public.address AS address ORDER BY address.address_id ASC ) AS address ON address.address_id = customer.address_id ORDER BY customer.customer_id ASC OFFSET 350 LIMIT 10 ) ORDER BY customer.customer_id ASC


The returned raw data directly from the database looks like:

[
  {
    "customer_id": 351,
    "store_id": 1,
    "first_name": "Jack",
    "last_name": "Foust",
    "email": "jack.foust@sakilacustomer.org",
    "address_id": 356,
    "activebool": true,
    "create_date": "2006-02-14T03:00:00.000Z",
    "last_update": "2013-05-26T17:49:45.738Z",
    "active": 1,
    "rental": [
      {
        "rental_id": 1792,
        "rental_date": "2005-06-16T20:04:50",
        "inventory_id": 3800,
        "customer_id": 351,
        "return_date": "2005-06-26T00:57:50",
        "staff_id": 1,
        "last_update": "2006-02-16T02:30:53",
        "staff": {
          "staff_id": 1,
          "first_name": "Mike",
          "last_name": "Hillyer",
          "address_id": 3,
          "email": "Mike.Hillyer@sakilastaff.com",
          "store_id": 1,
          "active": true,
          "username": "Mike",
          "password": "8cb2237d0679ca88db6464eac60da96345513964",
          "last_update": "2006-05-16T16:13:11.79328",
          "store": {
            "store_id": 1,
            "manager_staff_id": 1,
            "address_id": 1,
            "last_update": "2006-02-15T09:57:12"
          }
        },
        "payment": [
          {
            "payment_id": 17545,
            "customer_id": 351,
            "staff_id": 2,
            "rental_id": 1792,
            "amount": 5.99,
            "payment_date": "2007-02-16T18:33:16.996577"
          }
        ],
        "inventory": {
          "inventory_id": 3800,
          "film_id": 832,
          "store_id": 1,
          "last_update": "2006-02-15T10:09:17",
          "film": {
            "film_id": 832,
            "title": "Splash Gump",
            "description": "A Taut Saga of a Crocodile And a Boat who must Conquer a Hunter in A Shark Tank",
            "release_year": 2006,
            "language_id": 1,
            "rental_duration": 5,
            "rental_rate": 0.99,
            "length": 175,
            "replacement_cost": 16.99,
            "rating": "PG",
            "last_update": "2013-05-26T14:50:58.951",
            "special_features": [
              "Trailers",
              "Commentaries",
              "Deleted Scenes",
              "Behind the Scenes"
            ],
            "fulltext": "'boat':11 'conquer':14 'crocodil':8 'gump':2 'hunter':16 'must':13 'saga':5 'shark':19 'splash':1 'tank':20 'taut':4",
            "filmActor": [
              {
                "actor_id": 1,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 4,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 13,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 24,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 61,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 64,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 96,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 137,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 164,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              },
              {
                "actor_id": 165,
                "film_id": 832,
                "last_update": "2006-02-15T10:05:03"
              }
            ]
          }
        }
      },....
      

 
 
 

