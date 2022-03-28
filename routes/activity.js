'use strict';

// dependencies
const Path = require('path');
const JWT = require(Path.join(__dirname, '..', 'lib', 'jwtDecoder.js'));
const util = require('util');
const https = require('https');
const fileSystem = require('fs');
const nodeCache = require('node-cache');
const nodemailer = require('nodemailer');
const request_promise = require('request-promise');
const request = require('request');
const queryst = require('querystring');
const textEncoder = require('text-encoding');
const text = new textEncoder.TextEncoder();

let contactCounter = 0;

/**
 * @desc cache to store POSTBANK OAUTH token
 * 
 * @var {object} token      to populate with the token itself on request
 * @var {number} expire     the time that the token will be kept in cache
 * @var {number} counter    setTimeout multiplier
 * @var {number} index      index to track when a new token request must be done
 */
const cache = new nodeCache();
let token = { 'token': '' };
let expire = 0;
let counter = 2;
let index = 0;

/**
 * @desc cache to contain errors from requests
 * 
 * @var {array}     errorArray          array to store the request errors in one session, clears if the cache empties
 * @var {object}    tempErrorObject     object to store the errors, if any, between each requests
 * @var {number}    emailIndex          index to keep track when the cache is empty
 */
const errorCache = new nodeCache();
let errorArray = [];
let tempErrorObject = {};
let emailIndex = 0;

/**
 * @desc Marketing Cloud token cache
 * 
 * @var {object} mc_token   object that will hold the token value returned from the request
 * @var {number} mc_expire  expiration time of the token value in the cache, 0 is default
 * @var {number} mc_index   index to track when new token request is needed
 * */
const MC_CACHE = new nodeCache();
let mc_token = { 'token': '' }; 
let mc_expire = 0; 
let mc_index = 0; 

/**
 * @desc setting the caches, so checks could be made at first
 * 
 * @param {node-cache} MC_CACHE     cache for Marketing cloud OAUTH API token
 * @param {node-cache} errorCache   cache for keeping viber messages request errors
 * @param {node-cache} cache        cache for POSTBANK OAUTH API token
 */
MC_CACHE.set( 'mc_token', mc_token.token, mc_expire);
errorCache.set( 'errors', errorArray, expire );
cache.set( 'token', token.token, expire );

/**
 * @desc Postbank API credentials
 */
const GRANT_TYPE = 'client_credentials';
const CLIENT_ID = 'edb883df-f2a3-4cde-aaa1-bfaf61b0cff8';
const CLIENT_SECRET = 'V0fD4pD2qE4iM7yS0vN8nU4nK4uH0pN7oM1xJ4uA0sS0kC3wK7';
const SCOPE = 'notification_access';
const CONTENT_TYPE = 'Content-Type: ';
const CONTENT_TYPE_VALUE = 'application/x-www-form-urlencoded';
const CONTENT_TYPE_VIBER = 'application/json';
const ACCEPT = 'Accept: ';
const ACCEPT_VALUE = 'application/json';
const OAUTH_URL_DOMAIN = 'gate.postbank.bg';
const METHOD = 'POST';
const HOST = 'gate.postbank.bg';
const OAUTH_PATH = '/postbank/notifications/oauth2/token';
const VIBER_PATH = '/postbank/notifications/api/viberMessage';

/**
 * @desc Marketing cloud API credentials
 */
const MC_GRANT_TYPE = 'client_credentials';
const MC_CLIENT_ID = '0e8bh3jaxm5k3dwc4qyzlpx5';
const MC_CLIENT_SECRET = 'hEVwSHQzX2Rrrpz4ED0105yW';
const MC_ACCOUNT_ID = '510001942';
const MC_CONTENT_TYPE = 'application/json';
const MC_HOST = 'mcxm76rnzph90xdlcwcf04pb4bt1.auth.marketingcloudapis.com';
const MC_OAUTH_PATH = '/v2/token';
const MC_METHOD_INSERT = 'POST';
const MC_METHOD_UPSERT = 'PUT';
const MC_API_HOST = 'mcxm76rnzph90xdlcwcf04pb4bt1.rest.marketingcloudapis.com';
const MC_API_PATH = '/hub/v1/dataevents/key:DEF062C4-94EF-4046-8976-570D6247C2F8/rowset';
const MC_ACCEPT = '*/*';
const MC_ACCEPT_ENCODING = 'gzip, deflate, br';

// var currentDT = new Date();

var access_token = '';

/**
 * @desc construct the required design for POSTBANK TOKEN request
 * 
 * @var {object} BODY_OAUTH         BODY PARAM
 * @var {object} OAUTH_HEADERS      HEADERS PARAM
 * @var {object} options            object containing host, path, port, headers and method
 */
var BODY_OAUTH = queryst.stringify({
    'grant_type': GRANT_TYPE,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'scope': SCOPE
});
var OAUTH_HEADERS = {
    'Accept': ACCEPT_VALUE,
    'Content-Type': CONTENT_TYPE_VALUE,
    'Content-Length': BODY_OAUTH.length,
    'Host': HOST
};
const options = {
    host: OAUTH_URL_DOMAIN,
    path: OAUTH_PATH,
    port: 448,
    method: METHOD,
    headers: OAUTH_HEADERS,
};

/**
 * @desc construct the required design for VIBER request
 * 
 * @var {object} VIBER_HEADERS      object with the header paramters    
 * @var {object} BODY_VIBER         object with the parameters required in the body of the request
 * @var {object} options_viber      object containing host, path, port and method
 */
let VIBER_HEADERS = {
    'Host': 'gate.postbank.bg',
    'sourceSystem': 'SalesForce',
    'transactionUser': 'SalesForce',
    'userLanguage': 'BG',
    'Authorization': 'Bearer ',
    'priority': 3
};

var BODY_VIBER = {
    'RemoteSystemIdentifier': 'SalesForceSender',
    'SMSType': 316
};

let options_viber = {
    host: 'gate.postbank.bg',
    path: VIBER_PATH,
    port: 448,
    method: METHOD
};

/**
 * @desc construct the Marketing cloud token request
 * 
 * @var {object} MC_OAUTH_BODY      object with params for the body
 * @var {object} MC_OAUTH_HEADERS   object with header params
 * @var {object} MC_OAUTH_OPTIONS   object with host, path, port, method, headers for the request
 */
let MC_OAUTH_BODY = JSON.stringify({
    'grant_type': MC_GRANT_TYPE,
    'client_id': MC_CLIENT_ID,
    'client_secret': MC_CLIENT_SECRET,
    'account_id': MC_ACCOUNT_ID
});

let MC_OAUTH_HEADERS = {
    'Accept': MC_ACCEPT,
    'Accept-Encoding': MC_ACCEPT_ENCODING,
    'Content-Type': MC_CONTENT_TYPE,
    'Content-Length': MC_OAUTH_BODY.length,
    'Host': MC_HOST
};

let MC_OAUTH_OPTIONS = {
    host: MC_HOST,
    path: MC_OAUTH_PATH,
    port: 443,
    method: MC_METHOD_INSERT,
    headers: MC_OAUTH_HEADERS,
};

/**
 * @desc construct the upsert row into marketing cloud data extension request
 * 
 * @var {object} MC_UPSERT_HEADERS  object with headers  
 * @var {object} MC_UPSERT_BODY     object for attribute values that will be upserted into DE
 * @var {object} MC_UPSERT_OPTIONS  object with host, path, port, method
 */
let MC_UPSERT_HEADERS = {
    'Host': MC_API_HOST,
    'Content-Type': MC_CONTENT_TYPE,
};

let MC_UPSERT_BODY = [];

let MC_UPSERT_OPTIONS = {
    host: MC_API_HOST,
    path: MC_API_PATH,
    port: 443,
    method: MC_METHOD_INSERT,
};

let transaction_id = ''; // variable to store the current executing request's response from postbank with the needed Transaction ID

/**
 * @desc universal function used for all requests
 * 
 * @param {object} optionsParam object with request options/params host, path etc
 * @param {object} postData     object with values of the body
 */
function httpRequest( optionsParam, postData ) {
    return new Promise(function( resolve, reject ) {
        var req = https.request(optionsParam, function( res ) {
            // reject on bad status
            if ( res.statusCode < 200 || res.statusCode >= 300 ) {
                if ( optionsParam.path == OAUTH_PATH ) {
                    console.log( 'POSTBANK OATUH error -> response: ', res.statusMessage );
                } else if ( optionsParam.path == VIBER_PATH ) {
                    /**
                     * @desc when there are errors with the viber request, we store the error message.
                     * A temporary object is needed because request is made for every contact, therefore
                     * we do not want to send emails for every error, but rather collect these errors in 
                     * temp object and on every request we push into the error array the we will be using
                     * into the cache object
                     * 
                     * @var {object} tempErrorObject the temporary object that we will use to store, it needs
                     *                               to be cleared on every request
                     * @var {object} errorArray      the array that we are using, is is being cleared when 
                     *                               the cache expires
                     * @var {number} emailIndex      default 0, when it is 1 it means there are errors => 
                     *                               send emails
                     */
                    tempErrorObject[JSON.parse(postData).Recipient] = res.statusMessage;
                    errorArray.push( tempErrorObject );
                    tempErrorObject = {};
                    errorCache.set( 'errors', errorArray, 100 );
                    emailIndex = 1;
                    console.log( 'VIBER REQUEST error -> response: ', res.statusMessage );
                } else if ( optionsParam.path == MC_OAUTH_PATH ) {
                    console.log( 'MCAPI UPSERT error -> response: ', res.statusMessage );
                } else if ( optionsParam.path === MC_API_PATH ) {
                    console.log( 'MCAPI error -> response: ', res.statusMessage );
                }
                return reject(new Error('statusMessage=' + res.statusMessage));
            }
            // process data
            var body = '';
            res.on('data', function( chunk ) {
                body += chunk;
            });
            res.on('end', function() {
                try {
                    var bodyToString = body.toString();
                    var bodyToJson = JSON.parse( bodyToString );
                    if ( optionsParam.path == OAUTH_PATH ) {
                        token.token = bodyToJson.access_token; // saving the token to 'token' object
                        expire = bodyToJson.consented_on + 3600;
                    } else if ( optionsParam.path == VIBER_PATH ) {
                        transaction_id = bodyToJson.transactionID; // saving the transaction ID for each response
                    } else if ( optionsParam.path == MC_OAUTH_PATH ) {
                        mc_token.token = bodyToJson.access_token; // saving the MC token to 'mc_token' object
                        mc_expire = 1200;
                    } else if ( optionsParam.path === MC_API_PATH ) {

                    }

                } catch(e) {
                    return reject ( new Error('277-> error: ' + e) );
                }
                resolve( body) ;
            });
        });
        req.on('error', function( err ) {
            console.log('283 -> error: ', err);
            return reject ( new Error('284 -> error: ' + err) );
        });
        if ( postData ) {
            req.write( postData );
        }
        req.end();
    });

}

exports.logExecuteData = [];

function logData(req) {
    exports.logExecuteData.push({
        body: req.body,
        headers: req.headers,
        trailers: req.trailers,
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query,
        route: req.route,
        cookies: req.cookies,
        ip: req.ip,
        path: req.path,
        host: req.hostname,
        fresh: req.fresh,
        stale: req.stale,
        protocol: req.protocol,
        secure: req.secure,
        originalUrl: req.originalUrl
    });
    
    // var body = Buffer.from(req.body);
    // console.log('body:  ' + body.toString);
    // console.log('body: ' + util.inspect(req.body));
    // console.log('headers: ' + req.headers);
    // console.log('trailers: ' + req.trailers);
    // console.log('method: ' + req.method);
    // console.log('url: ' + req.url);
    // console.log('params: ' + util.inspect(req.params));
    // console.log('query: ' + util.inspect(req.query));
    // console.log('route: ' + req.route);
    // console.log('cookies: ' + req.cookies);
    // console.log('ip: ' + req.ip);
    // console.log('path: ' + req.path);
    // console.log('host: ' + req.host);
    // console.log('fresh: ' + req.fresh);
    // console.log('stale: ' + req.stale);
    // console.log('protocol: ' + req.protocol);
    // console.log('secure: ' + req.secure);
    // console.log('originalUrl: ' + req.originalUrl);

}

exports.edit = function (req, res) {
    JWT(req.body, process.env.jwtSecret_NEXT_PB, (err, decoded) => {

        if (err) {
            console.log( '343 -> error: ', err);
            console.error(err);
            return res.status(401).end();
        }

        if ( decoded ) {
            // console.log('edit JWT');
            logData(req);
            res.status(200).send('Edit');

        } else {
            console.log( '354 -> error: not decoded' );
            console.error('inArguments invalid.');
            return res.status(400).end();
        }

    });
};

exports.save = function (req, res) {
    JWT(req.body, process.env.jwtSecret_NEXT_PB, (err, decoded) => {

        if (err) {
            console.log( '366 -> error: ', error );
            console.error(err);
            return res.status(401).end();
        }

        if ( decoded ) {
            // console.log('save JWT');
            logData(req);
            res.status(200).send('Save');

        } else {
            console.log( '377 -> error: not decoded' );
            console.error('inArguments invalid.');
            return res.status(400).end();
        }

    });
};

exports.execute = function (req, res) {
    
    JWT(req.body, process.env.jwtSecret_NEXT_PB, (err, decoded) => {
        // console.log( '388 -> error: ', err );
        if ( err ) {
            console.log('390 -> FAILED', err);
            console.error( err );
            return res.status(401).end();
        }

        if ( decoded && decoded.inArguments && decoded.inArguments.length > 0 ) {
            //console.log('certificate: ', fileSystem.readFileSync(Path.join(__dirname, 'testgate.pem')));

            let decodedArgs = decoded.inArguments[0]; // incoming payload from the journey, must be declared here otherwise it gets its last value

            process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
            
            // format date to be suitable for DataExtension rows
            let currentDate = new Date();
            let date = ('0' + currentDate.getDate()).slice(-2);
            let month = ('0' + (currentDate.getMonth() + 1)).slice(-2);
            let year = currentDate.getFullYear();

            let currentDateFormatted = year + '-' + month + '-' + date; // used as timestamp for viber request
            let Today = (date + '-' + month + '-' + year).toString(); // used to input data into Viber text customization, need to be formatted as dd-mm-yyyy
            counter = ++counter;
            contactCounter = ++contactCounter;

            let errorStatus = ''; // catching promise rejection

            // console.log('payload: ', decodedArgs);
            console.log('payloadText: ', decodedArgs.viber);
            console.log('contactCounter: ', contactCounter);
            console.log('Telephone: ', decodedArgs.Recipient);
            // console.log('contactKey: ', decodedArgs.ContactKey);
            // var ProductName = decodedArgs.ProductName;
            // var Address = decodedArgs.Address;
            // var viberTextString = decodedArgs.viber;
            // var viberLiteralMessage = eval('`'+ viberTextString + '`');
            // console.log('viberLiteralMessage: ', viberLiteralMessage);

            /**
             * @desc checking every cache object for its content. If it's null/expired:
             *       Postbank API token expired => index set to 0, so new request could be made
             *       MC Token API expired => mc_index set  to 0, so new request could be made
             *       Error cache expired => clear errorArray, so it could contain only new errors
             */
            if ( !Boolean(cache.get( 'token' )) ) {
                index = 0;
            }

            if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                mc_index = 0;
            }

            if ( !Boolean(errorCache.get( 'errors' )) ) {
                errorArray = [];
            }

            mc_token_request();
            tokenRequest();

            setTimeout(() => {
                if ( !Boolean(cache.get( 'token' )) ) {
                    setTimeout(() => {
                        if ( !Boolean(cache.get( 'token' )) ) {
                            setTimeout(() => {
                                if ( !Boolean(cache.get( 'token' )) ) {
                                    index = 0;
                                    // making new request for the oauth token
                                    tokenRequest();

                                    // setTimeout used here to wait for the token response
                                    setTimeout(() => {
                                        getParams( decodedArgs, currentDateFormatted, currentDate );

                                        httpRequest( options_viber, JSON.stringify(BODY_VIBER) ).then(function() {
                                            // console.log('6000 * counter * 2');
                                            if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                                                // if MC_CACHE is empty ( mc_token has expired ), make new request for the token
                                                mc_token_request();

                                                // wait for the token
                                                setTimeout(() => {
                                                    mcGetParams( decodedArgs, currentDate );
                                                    httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {

                                                    });
                                                }, 1500 * counter);
                                            } else if ( Boolean(MC_CACHE.get('mc_token')) ) {
                                                mcGetParams( decodedArgs, currentDate );
                                                httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {

                                                });
                                            }
                                        }).catch((error) => {
                                            errorStatus = error.toString();

                                            console.log('483 -> check if includes Unauthorized: ', Boolean(errorStatus.includes('Unauthorized')));
                                        });
                                    }, 1500);
                                } else if ( Boolean(cache.get( 'token' )) ) {
                                    getParams( decodedArgs, currentDateFormatted, currentDate );

                                    httpRequest( options_viber, JSON.stringify(BODY_VIBER) ).then(function() {
                                        // console.log('6000*counter: ', counter);
                                        if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                                            // if MC_CACHE is empty ( mc_token has expired ), make new request for the token
                                            mc_token_request();

                                            // wait for the  token response before making new request
                                            setTimeout(() => {
                                                mcGetParams( decodedArgs, currentDate );
                                                httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                                    
                                                });
                                            }, 1500 * counter);
                                        } else if ( Boolean(MC_CACHE.get('mc_token')) ) {
                                            mcGetParams( decodedArgs, currentDate );
                                            httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                                
                                            });
                                        }
                                    }).catch((error) => {
                                        errorStatus = error.toString();
                                        console.log('510 -> check if includes Unauthorized: ', Boolean(errorStatus.includes('Unauthorized')));
                                    });
                                }
                            }, (6000 * counter) * 2);
                        } else if ( Boolean(cache.get( 'token' )) ) {
                            getParams( decodedArgs, currentDateFormatted, currentDate );

                            httpRequest( options_viber, JSON.stringify(BODY_VIBER) ).then(function() {
                                // console.log('3000*counter: ', counter);
                                if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                                    // if MC_CACHE is empty ( mc_token has expired ), make new request for the token
                                    mc_token_request();

                                    // wait for the token response before making new request
                                    setTimeout(() => {
                                        mcGetParams( decodedArgs, currentDate );
                                        httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                            
                                        });
                                    }, 1500 * counter);
                                } else if ( Boolean(MC_CACHE.get('mc_token')) ) {
                                    mcGetParams( decodedArgs, currentDate );
                                    httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                        
                                    });
                                }
                            }).catch((error) => {
                                errorStatus = error.toString();

                                console.log('539 -> check if includes Unauthorized: ', Boolean(errorStatus.includes('Unauthorized')));
                            });
                        }
                    }, (3000 * counter) * 2);
                } else if ( Boolean(cache.get( 'token' )) ) {
                    getParams( decodedArgs, currentDateFormatted, currentDate );

                    httpRequest( options_viber, JSON.stringify(BODY_VIBER) ).then(function() {
                        // console.log('1500*counter: ', counter);
                        if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                            // if MC_CACHE is empty ( mc_token has expired ), make new request for the token
                            mc_token_request();

                            // wait for the token response before making new request
                            setTimeout(() => {
                                mcGetParams( decodedArgs, currentDate );
                                httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                    
                                });
                            }, 1500 * counter);
                        } else if ( Boolean(MC_CACHE.get('mc_token')) ) {
                            mcGetParams( decodedArgs, currentDate );
                            httpRequest( MC_UPSERT_OPTIONS, JSON.stringify( MC_UPSERT_BODY ) ).then( () => {
                                
                            });
                        }
                    }).catch((error) => {
                        errorStatus = error.toString();

                        console.log('568 -> check if includes Unauthorized: ', Boolean(errorStatus.includes('Unauthorized')));
                    });
                }
            }, (1500 * counter) * 2);
            if ( counter > 10 ) {
                counter = 2;
            }

            /**
             * @desc if emailIndex === 1 => there are errors. Send every 90seconds email, expiration time of the 
             *       cache that holds the error array is 100seconds.
             */
            // setTimeout(() => {
            //     if ( emailIndex === 1 ) {
            //         emailIndex = 0;
            //         sendEmails( decodedArgs );
            //         console.log( 'email sending ');
            //     }
            // }, 90000);
            // console.log( 'res: ', res );
            logData(req);
            // res.status(200).send( 'Execute' );
            res.status(200).json( {success: 'true'} );
        } else {
            console.log('564 -> FAILED');
            console.error('inArguments invalid.');
            return res.status(400).end();
        }
    });
};

exports.publish = function (req, res) {
    JWT(req.body, process.env.jwtSecret_NEXT_PB, (err, decoded) => {

        if (err) {
            console.log( '575 -> error: ', err );
            console.error(err);
            return res.status(401).end();
        }

        if ( decoded ) {
            // console.log('publish JWT');
            logData(req);
            res.status(200).send('Publish');

        } else {
            console.log( '586 -> error: not decoded' );
            console.error('inArguments invalid.');
            return res.status(400).end();
        }

    });
};

exports.validate = function (req, res) {
    JWT(req.body, process.env.jwtSecret_NEXT_PB, (err, decoded) => {

        if (err) {
            console.log( '598 -> error: ', err );
            console.error(err);
            return res.status(401).end();
        }

        if ( decoded ) {
            // console.log('validate JWT');
            logData(req);
            res.status(200).send('Validate');

        } else {
            console.log( '609 -> error: not decoded' );
            console.error('inArguments invalid.');
            return res.status(400).end();
        }

    });
};

/**
 * @desc function to make a request for OAUTH Postbank token
 */
function tokenRequest() {
    setTimeout(() => {
        if ( index == 0 ) {
            index = 1;
            setTimeout(() => {
                if ( !Boolean(cache.get( 'token' )) ) {
                    httpRequest( options, BODY_OAUTH ).then(function() {
                        cache.set( 'token', token.token, 3600 ); // setting 1hr as expiration  time
                        VIBER_HEADERS.Authorization = 'Bearer ';
                        VIBER_HEADERS.Authorization += token.token;
                    });
                }
            }, 1000 * counter );
        }
    }, 1000);
}

/**
 * @desc function to make a request for OAUTH Marketing cloud token
 */
let mc_token_request = () => {
    setTimeout(() => {
        if ( mc_index == 0 ) {
            mc_index = 1;
            setTimeout(() => {
                if ( !Boolean(MC_CACHE.get( 'mc_token' )) ) {
                    httpRequest( MC_OAUTH_OPTIONS, MC_OAUTH_BODY ).then(function() {
                        MC_CACHE.set( 'mc_token', mc_token.token, 1200 ); // setting 20min as expiration time
                        MC_UPSERT_HEADERS.Authorization = 'Bearer ';
                        MC_UPSERT_HEADERS.Authorization += mc_token.token;
                    });
                }
            }, 1000 * counter );
        }
    }, 1000);
};

/**
 * @desc function to build the parameters needed for the MC's request headers and body
 */
let mcGetParams = ( args, executionTime ) => {
    MC_UPSERT_BODY[0] = {};
    MC_UPSERT_BODY[0]['keys'] = {
        'TransactionID': transaction_id
    };

    MC_UPSERT_BODY[0]['values'] = {
        'Recipient': args.Recipient,
        'EGN': args.ContactKey,
        'ActivityID': args.ActivityID,
        'ExecutionTime': executionTime
    };
    // console.log( 'MC_UPSERT_BODY -> ', MC_UPSERT_BODY );

    let mc_upsert_body_length = text.encode( JSON.stringify(MC_UPSERT_BODY) ).length;

    MC_UPSERT_HEADERS['Content-Length'] = mc_upsert_body_length;
    MC_UPSERT_OPTIONS.headers = MC_UPSERT_HEADERS;
};

/**
 * @desc function to build the parameters needed for viber requests
 * 
 * @param {object} args 
 * @param {date} dateStamp 
 * @param {date} timeStamp 
 */
let getParams = ( args, dateStamp, timeStamp ) => {
    // customization variables for template strings in viber text
    var FirstName = args.FirstName;  // console.log('FirstName: ', FirstName);
    var First_Name = args.First_Name; // console.log('First_Name: ', First_Name);
    var Product = args.Product; //console.log('Product: ', Product);
    var ProductName = args.ProductName; // console.log('ProductName: ', ProductName);
    var TotalPoints = args.TotalPoints; // console.log('TotalPoints: ', TotalPoints);
    var Address = args.Address; // console.log('Address: ', Address);
    let New_loan_amount = args.New_loan_amount; // console.log('New_loan_amount: ', New_loan_amount);
    let Tenor = args.Tenor; // console.log('Tenor: ', Tenor);
    let Installment = args.Installment; // console.log('Tenor: ', Tenor);
    let Today = args.Today; // console.log( 'Today: ', Today );
    // console.log( '679 - > tel: ', args.Recipient );
    // https request headers and body
    var viberTextString = args.viber;
    var viberLiteralMessage = eval('`'+ viberTextString + '`');
    BODY_VIBER.Recipient = args.Recipient;
    BODY_VIBER.ViberText = viberLiteralMessage;
    BODY_VIBER.SMSText = args.sms;
    BODY_VIBER.ViberButtonName = args.button_name;
    BODY_VIBER.ViberButtonUrl = args.button_url;
    BODY_VIBER.ViberImageUrl = args.image_url;
    var body_viber_length = text.encode( JSON.stringify(BODY_VIBER) ).length;
    VIBER_HEADERS.Accept = ACCEPT_VALUE;
    VIBER_HEADERS['Content-Type'] = CONTENT_TYPE_VIBER;
    VIBER_HEADERS['Content-Length'] = body_viber_length;
    VIBER_HEADERS.transactionDateStamp = dateStamp;
    VIBER_HEADERS.transactionTimeStamp = timeStamp;
    options_viber.headers = VIBER_HEADERS;
}

/**
 * @desc function to send emails when there are errors, only working on viber requests. 
 *       for more - add error insert on PB token request and MC requests.
 * 
 */
let sendEmails = ( args ) => {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'digital@next-consult.com',
          pass: 'cpetjlzehcvhszed'
        }
    });
    
    let mailOptions = {
      from: 'digital@next-consult.com',
      to: 'teodor.dimitrov@next-consult.com, emil.vuchkov@next-consult.com',
      subject: 'Errors from activity: ' + args.ActivityID,
      text: 'Errors occurred for these recipients: ' + JSON.stringify( errorCache.get('errors') )
    };
    
    transporter.sendMail(mailOptions, function( error, info ) {
      if ( error ) {
        console.log( error.response );
      } else {
        console.log( 'Email sent: ' + info.response );
      }
    });
}