define([
    'postmonger'
], function (
    Postmonger
) {
    'use strict';

    var connection = new Postmonger.Session();
    var authTokens = {};
    var payload = {};
    var eventDefinitionKey = {};
    var requestedInteractionDefaults = {}; // object returned from requestedInteractionDefaults
    let steps = [ 
        { "label": "Enter Data", "key": "step1" },
        { "label": "Check Viber Text", "key": "step2" }
    ];
    
    let currentStep = steps[0].key;
    var button_url = '';
    var image_url = '';
    var button_name = '';
    var viber_text = '';
    var sms_text = '';
    var recipient = '';
    let activityID = '';
    let ck = '';
    let index = 0; // using this index to control the evaluation of viber and when to make 'Done' active
    let isViberTextSendable = false;
    let regexMatch = '';
    let regexArray = [];
    let customizationArrayLiterals = [];
    let customizationArrayString = [];
    let bracketsArray = [];
    let tempBracketsArray = [];
    let squareBracketsString = [];
    let roundBracketsString = [];
    let notEmptyCustomizationFields = [];
    let notEmptyCustomizationFieldsHolder = [];
    let holderPayloadData = {};
    let requestSchema = [];

    // array used to check the correct syntax of the used personalization strings
    customizationArrayString = 
    [ 
        'FirstName', 'First_Name', 'Product', 
        'ProductName', 'TotalPoints',
        'Address', 'Today', 'New_loan_amount',
        'Tenor', 'Installment'
    ]
    
    $(window).ready(onRender);
    
    connection.on('initActivity', initialize);
    connection.on('requestedTokens', onGetTokens);
    connection.on('requestedEndpoints', onGetEndpoints);

    connection.on('clickedNext', clickedNext);
    connection.on('clickedBack', clickedBack);
    connection.on('gotoStep', gotoStep);
   
    function onRender() {
        // JB will respond the first time 'ready' is called with 'initActivity'
        connection.trigger('ready');
        
        connection.trigger('requestTokens');
        connection.trigger('requestEndpoints');
        connection.trigger('requestInteractionDefaults');
        connection.trigger('requestTriggerEventDefinition');
        connection.trigger('requestSchema');
        connection.trigger('requestInteraction');
    }

    function initialize(data) {
        console.log('data: ', data);
        if (data) {
            payload = data;
        }
        
        var hasInArguments = Boolean(
            payload['arguments'] &&
            payload['arguments'].execute &&
            payload['arguments'].execute.inArguments &&
            payload['arguments'].execute.inArguments.length > 0
        );
        // console.log('payload[arguments]', payload['arguments']);
        // console.log('payload[arguments].execute', payload['arguments'].execute);
        // console.log('payload[arguments].execute.inArguments:', payload['arguments'].execute.inArguments);
        var inArguments = hasInArguments ? payload['arguments'].execute.inArguments : {};
        console.log('inArguments:', inArguments);
        activityID = payload['arguments'].activityId;
        ck = payload['arguments'].contactKey;
        

        // array, used to display the viable personalization string on the modal window
        
        customizationArrayLiterals = 
        [ 
            '${FirstName}', '${First_Name}', '${Product}', 
            '${ProductName}', '${TotalPoints}',
            '${Address}', '${Today}', '${New_loan_amount}',
            '${Tenor}', '${Installment}'
        ];
        let htmlList = $( 'ul.customizations' );

        $.each( customizationArrayLiterals, (i) => {
            let listTag = $( '<li/>' )
                    .addClass( 'viber-customs-list' )
                    .appendTo( htmlList );
            let listRow = $( '<a/>' )
                        .addClass( 'viber-customs-row ')
                        .text( customizationArrayLiterals[i] )
                        .css( 'color', 'white' )
                        .appendTo( listTag );
        });

        // keeping the values of previously saved inputs
        $.each(inArguments, function (index, inArgument) {
            $.each(inArgument, function (key, val) {
                console.log('viber: ', inArgument['viber']);
                $( '#button_url' ).val( inArgument['button_url'] );
                $( '#image_url' ).val( inArgument['image_url'] );
                $( '#button_name' ).val( inArgument['button_name'] );
                $( '#viber' ).val( inArgument['viber'] );
                $( '#sms' ).val( inArgument['sms'] );
            });
        });
        
        connection.trigger('updateButton', {
            button: 'next',
            text: 'next',
            visible: true
        });

    }

    function clickedNext() {
        viber_text = $('#viber').val(); // get viber text from the first step
        console.log( 'clickedNext, viber_text: ', viber_text );
        
        evaluateViberText( viber_text );
        setTimeout(() => {
            if ( index === 1 && currentStep.key === 'step2' ) {
                save();
            } else {
                connection.trigger('nextStep');
            }
        }, 3);
    }

    function clickedBack() {
        connection.trigger('prevStep');
        notEmptyCustomizationFields = [];
    }
    function gotoStep( step ) {
        console.log( 'gotoStep, step: ', step );
        showStep( step );
        connection.trigger( 'ready ');
    }

    /**
     * @desc function to utilize show/hide inputs, text, buttons between steps
     * 
     * @param {object} step object that holds the current step 
     * @param {*} stepIndex 
     */
    function showStep( step, stepIndex ) {
        if ( stepIndex == 1 ) {
            // step = steps[ stepIndex ]; 
        }

        currentStep = step;

        // $('.step').hide();
        
        switch( currentStep.key ) {
            case 'step1':
                $('#step1').show();
                $('#list').show();
                connection.trigger( 'updateButton', {
                    button: 'next',
                    enabled: true
                });
                connection.trigger( 'updateButton', {
                    button: 'back',
                    visible: false
                });
                $('#step2').hide();
                break;
            case 'step2':
                $('#step2').show();
                connection.trigger( 'updateButton', {
                    button: 'back',
                    enabled: true
                });
                connection.trigger( 'updateButton', {
                    button: 'next',
                    text: 'done',
                    visible: true,
                    enabled: isViberTextSendable
                });
                $('#step1').hide();
                $('#list').hide();
                break;
        }
    }
    
    function onGetTokens( tokens ) {
        console.log( tokens );
        authTokens = tokens;
    }

    function onGetEndpoints( endpoints ) {
        console.log( endpoints );
    }

    /**
     * @desc requestedTriggerEventDefinition event that returns information from the entry point DE
     *       *entry point Data Extension - every journy has an entry point where it gets all the records
     */
    connection.on('requestedTriggerEventDefinition',
    function( eventDefinitionModel ) {
        if ( eventDefinitionModel ) {
            eventDefinitionKey = eventDefinitionModel.eventDefinitionKey;
            console.log('eventDefinitionModel: ', eventDefinitionModel);
            // console.log( 'payload tel: ', payload);
        }
    });

    /**
     * @desc requestedInteractionDefaults is the default settings of the journey, 
     *       mainly used for mobile number
     */
    connection.on('requestedInteractionDefaults',
    function( settings ) {
        console.log( 'settings: ', settings );
        if ( settings ) {
            requestedInteractionDefaults = settings;
        }
    });

    connection.on('requestedSchema', function (data ) {
        console.log( 'schema: ', data['schema']);
        requestSchema = data['schema'];
    })
    
    connection.on('requestedInteraction', function ( data ) {
        console.log( 'requestedInteraction', data );

    });
    /**
     * @desc anytime Done is clicked on the modal window, save() is called
     */
    function save() {
        button_url = $('#button_url').val();
        image_url = $('#image_url').val();
        button_name = $('#button_name').val();
        viber_text = $('#viber').val();
        sms_text = $('#sms').val();
        
        if ( requestedInteractionDefaults.mobileNumber[0] != null ) {
            recipient = requestedInteractionDefaults.mobileNumber[0];
        }
        
        if ( Boolean(button_url) ) {
            holderPayloadData['button_url'] = button_url;
        }
        if ( Boolean(image_url) ) {
            holderPayloadData['image_url'] = image_url;
        }
        if( Boolean(button_name) ) {
            holderPayloadData['button_name'] = button_name;
        }
        if( Boolean(viber_text) ) {
            holderPayloadData['viber'] = viber_text;
        }
        if ( Boolean(sms_text) ) {
            holderPayloadData['sms'] = sms_text;
        }
        payload['arguments'].execute.inArguments = [{}];

        if ( notEmptyCustomizationFields.length > 0 ) {
            console.log(notEmptyCustomizationFields.length);
            for (let index = 0; index < notEmptyCustomizationFields.length; index++) {
                holderPayloadData[notEmptyCustomizationFields[index]] = 
                    // "{{Event." + eventDefinitionKey + ".\"" + 
                    // notEmptyCustomizationFields[index].toString() +
                    // "\"}}";
                    "{{Event.";
                    holderPayloadData[notEmptyCustomizationFields[index]] += eventDefinitionKey;
                    holderPayloadData[notEmptyCustomizationFields[index]] += ".\"";
                    holderPayloadData[notEmptyCustomizationFields[index]] += notEmptyCustomizationFields[index];
                    holderPayloadData[notEmptyCustomizationFields[index]] += "\"}}"; 
                // for (let i = 0; i < requestSchema.length; i++) {
                //     let key;
                //     if ( requestSchema[i].key != null ) {
                //         key = requestSchema[i].key;
                //         if ( key.includes( notEmptyCustomizationFields[ index ])) {
                //             let keySplit = key.split('.');
                //             console.log( key );
                //             console.log( key.split('.'));
                //             if ( notEmptyCustomizationFields[index] == keySplit[2] ) {
                //                 console.log( 'match: ', notEmptyCustomizationFields[index] );
                //                 holderPayloadData[notEmptyCustomizationFields[index]] = "{{" + key + "}}";
                //             }
                //         }
                //     }
                // }
            }
        }
        let jsonstring = JSON.stringify(holderPayloadData);
        console.log( 'holderPayloadData JSON: ', JSON.stringify(holderPayloadData));
        console.log( 'jsonstring: ', jsonstring);
        console.log( 'holderPayloadData JSON.parse: ', JSON.parse(jsonstring));
 
        // holderPayloadData['Recipient'] = recipient;
        // holderPayloadData['ActivityID'] = "{{Activity.Id}}";
        // holderPayloadData['ContactKey'] = "{{Context.ContactKey}}";
        // holderPayloadData['ProductName'] = '{{Event.' + eventDefinitionKey + '.\"ProductName\"}}';
        // holderPayloadData["Address"] = "{{Event." + eventDefinitionKey + ".\"Address\"}}";
        // holderPayloadData["FirstName"] = "{{Event." + eventDefinitionKey + ".\"FirstName\"}}";
        // holderPayloadData["Product"] = "{{Event." + eventDefinitionKey + ".\"Product\"}}";
        // holderPayloadData["First_Name"] = "{{Event." + eventDefinitionKey + ".\"First_Name\"}}";
        // holderPayloadData["TotalPoints"] = "{{Event." + eventDefinitionKey + ".\"TotalPoints\"}}";

        // payload['arguments'].execute.inArguments = [{}];
        payload['arguments'].execute.inArguments[0] = holderPayloadData;
        payload['arguments'].execute.inArguments[0]['Recipient'] = recipient;
        payload['arguments'].execute.inArguments[0]['ActivityID'] = "{{Activity.Id}}";
        payload['arguments'].execute.inArguments[0]['ContactKey'] = "{{Context.ContactKey}}";
        // payload['arguments'].execute.inArguments[0]['ProductName'] = "{{Event." + eventDefinitionKey + ".\"ProductName\"}}"; 
        // payload['arguments'].execute.inArguments[0]['Address'] = "{{Event." + eventDefinitionKey + ".\"Address\"}}";
        console.log( 'payload JSON: ', JSON.stringify(payload['arguments'].execute.inArguments));
        // if ( notEmptyCustomizationFields.length > 0 ) {
        //     console.log(notEmptyCustomizationFields.length);
        //     for (let index = 0; index < notEmptyCustomizationFields.length; index++) {
        //         holderPayloadData[notEmptyCustomizationFields[index]] = 
        //             // "{{Event." + eventDefinitionKey + ".\"" + 
        //             // notEmptyCustomizationFields[index].toString() +
        //             // "\"}}";
        //             "{{Event.";
        //             payload['arguments'].execute.inArguments[0][notEmptyCustomizationFields[index]] += eventDefinitionKey;
        //             payload['arguments'].execute.inArguments[0][notEmptyCustomizationFields[index]] += ".\"";
        //             payload['arguments'].execute.inArguments[0][notEmptyCustomizationFields[index]] += notEmptyCustomizationFields[index];
        //             payload['arguments'].execute.inArguments[0][notEmptyCustomizationFields[index]] += "\"}}"; 
        //         // for (let i = 0; i < requestSchema.length; i++) {
        //         //     let key;
        //         //     if ( requestSchema[i].key != null ) {
        //         //         key = requestSchema[i].key;
        //         //         if ( key.includes( notEmptyCustomizationFields[ index ])) {
        //         //             let keySplit = key.split('.');
        //         //             console.log( key );
        //         //             console.log( key.split('.'));
        //         //             if ( notEmptyCustomizationFields[index] == keySplit[2] ) {
        //         //                 console.log( 'match: ', notEmptyCustomizationFields[index] );
        //         //                 holderPayloadData[notEmptyCustomizationFields[index]] = "{{" + key + "}}";
        //         //             }
        //         //         }
        //         //     }
        //         // }
        //     }
        // }

        // payload['arguments'].execute.inArguments = [{
        //     'button_url': button_url,
        //     'image_url': image_url,
        //     'button_name': button_name,
        //     'viber': viber_text,
        //     'sms': sms_text,
        //     'Recipient': recipient,
        //     'FirstName': "{{Event." + eventDefinitionKey + ".\"FirstName\"}}",
        //     'Product': "{{Event." + eventDefinitionKey + ".\"Product\"}}",
        //     'ProductName': '{{Event.' + eventDefinitionKey + '.\"ProductName\"}}',
        //     'First_Name': '{{Event.' + eventDefinitionKey + '.\"First_Name\"}}',
        //     'TotalPoints': '{{Event.' + eventDefinitionKey + '.\"Total_Points\"}}',
        //     'Address': '{{Event.' + eventDefinitionKey + '.\"Address\"}}',
        //     'ActivityID': "{{Activity.Id}}",
        //     'ContactKey': ck
        // }];

        payload['metaData'].isConfigured = true;
        console.log('save');
        connection.trigger('updateActivity', payload);
    }

    /**
     * @desc check if the inputted personalization strings are with correct syntax
     *  
     * @param {string} viberTextToCheck 
     */
    function evaluateViberText( viberTextToCheck ) {
        console.log( 'viberTextToCheck: ', viberTextToCheck );
        if ( !viberTextToCheck.includes('$') ) {
            index = 1;
            isViberTextSendable = true;
            $( '#viber_check' ).val( 'No validation required.' );
        }

        // checking if there are any opnening '{'
        if ( !checkSymbolBeforeBracket( viberTextToCheck ) ) {
            index = 0;
            isViberTextSendable = false;
            $( '#viber_check' ).val( 'Missing $' );
            return;
        }

        // check if viber text includes '[]'
        if ( !checkSquareBrackets( viberTextToCheck ) ) {
            index = 0;
            isViberTextSendable = false;
            return;
        }

        // check if viber text  includes '()'
        if ( !checkRoundBrackets( viberTextToCheck ) ) {
            index = 0;
            isViberTextSendable = false;
            return;
        }

        let substring = '\\$';
        let regex = new RegExp( substring + '.*?(\\S*})', 'g' ); // matching everything after '&' symbol
        
        while ( (regexMatch = regex.exec( viberTextToCheck )) ) {
            console.log( 'while: ', viberTextToCheck );
            regexArray.push( regexMatch[1] ); // pushing matches, if any
        }

        // check the array with the matches from above regex
        checkRegexArray( regexArray );
    }

    /**
     * @desc evaluating if the correct brackets are used and if the string fo the personalization
     *       is correct
     * 
     * @param {array} arrayToCheck array that holds matches after '$' symbol is met
     */
    function checkRegexArray( arrayToCheck ) {
        console.log( arrayToCheck );
        for (let i = 0; i < arrayToCheck.length; i++) {
            let firstBracket = arrayToCheck[i].charAt(0);
            let secondBracket = arrayToCheck[i].charAt( arrayToCheck[i].length - 1 );
            let firstElementRemove = arrayToCheck[i].slice( 1, arrayToCheck[i].length  - 1 );
            
            if ( !customizationArrayString.includes(firstElementRemove) ) {
                index = 0;
                isViberTextSendable = false;
                $( '#viber_check' ).val( 'Incorrect field name: ' + firstElementRemove );
                tempBracketsArray = [];
                regexArray = [];
                bracketsArray = [];
                return;
            } else if ( customizationArrayString.includes(firstElementRemove) ) {
                if ( !notEmptyCustomizationFields.includes(firstElementRemove) ) {
                    notEmptyCustomizationFields.push( firstElementRemove );
                }
            }

            bracketsArray.push( firstBracket );
            bracketsArray.push( secondBracket );
        }
        console.log( 'notEmptyPersonalizationArray: ', notEmptyCustomizationFields );
        bracketsArray.forEach(element => {
            if ( element != '{' && element != '}' ) {
                tempBracketsArray.push( element );
                index = 0;
                isViberTextSendable = false;
                $( '#viber_check' ).val( 'Bad syntax. Check brackets.' );
            } else if ( tempBracketsArray.length === 0 ) {
                index = 1;
                isViberTextSendable = true;
                $( '#viber_check' ).val( 'Correct syntax.' );
            }
        });
        tempBracketsArray = [];
        regexArray = [];
        bracketsArray = [];
    };

    /**
     * @desc checks symbol before any opening '{' in the text
     * 
     * @param {string} inputText viber text
     */
    let checkSymbolBeforeBracket = ( inputText ) => {
        let isCorrect = true;
        for ( let i = 0; i < inputText.length; i++ ) {
            let char = inputText.charAt( i );
            if ( char ===  '{' ) {
                if ( inputText[i - 1] != '$' ) {
                    isCorrect = false;
                }
            }
        }

        return isCorrect;
    };

    /**
     * @desc checks if the string between '[]' in the text is matching any of the personalization strings
     * 
     * @param {string} text_squareBracket viber text
     */
    let checkSquareBrackets = ( text_squareBracket ) => {
        let squareBracketIncl = true;
        let regex_squareBrackets = new RegExp( '\\[([^\\]]+)\\]', 'g');
        let sb;
        while ( (sb = regex_squareBrackets.exec( text_squareBracket )) != null ) {
            squareBracketsString.push( sb[1] );
        }

        squareBracketsString.forEach(element => {
            if ( customizationArrayString.includes( element ) ) {
                $( '#viber_check' ).val( 'Wrong brackets for: ' +  '[' + element + ']' );
                squareBracketIncl = false;
                squareBracketsString = [];
                return squareBracketIncl;
            }
        });
        return squareBracketIncl;
    }

    /**
     * @desc checks if the string between '()' in the text is matching any of the personalization strings
     * 
     * @param {string} text_roundBrackets viber text
     */
    let checkRoundBrackets = ( text_roundBrackets ) => {
        let roundBracketIncl = true;
        let regex_roundBrackets = new RegExp( '\\(([^\\)]+)\\)', 'g');
        let sb;
        while ( (sb = regex_roundBrackets.exec( text_roundBrackets )) != null ) {
            roundBracketsString.push( sb[1] );
        }

        roundBracketsString.forEach(element => {
            if ( customizationArrayString.includes( element ) ) {
                $( '#viber_check' ).val( 'Wrong brackets for: ' +  '(' + element + ')' );
                roundBracketIncl = false;
                roundBracketsString = [];
                return roundBracketIncl;
            }
        });
        return roundBracketIncl;
    }
});