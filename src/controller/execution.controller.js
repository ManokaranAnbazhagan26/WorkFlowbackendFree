const nodemailer = require("nodemailer");
const ExecutionFlow = require("../model/ExecutionFlow");
const ExecutionFlowSteps = require("../model/ExecutionFlowSteps");
const { literal, Op } = require("sequelize");
const Flow = require("../model/Flow");
const FlowDetails = require("../model/FlowDetails");
const { sequelize } = require("../model");
const SheduleNotification = require("../model/SheduleNotification");
const { logger } = require("../utils/services/logger");
const { default: axios } = require("axios");
const { flowExecutionUpdate } = require("../utils/services/socket");

const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
        user: "pluto@zerozilla.com",
        pass: "ApOtnJmPAaOHAf3",
    },
});

const dynamicSendEmail = async (data) => {
    const logs = {};
    try {
        const { EmailRecipient = [], EmailSubject, BodyType, MessageBody, CCEmails = [], BCCEmails = [], ActionRequired = false } = data;
        logs['EmailPayload'] = data
        const info = await transporter.sendMail({
            from: '"CLYKOPS" <pluto@zerozilla.com>', // sender address
            to: EmailRecipient, // list of receivers
            subject: EmailSubject, // Subject line
            cc: CCEmails.join(','), //
            bcc: BCCEmails.join(','),
            text: BodyType == 'text' ? MessageBody : '', // plain text body
            html: BodyType == 'html' ? MessageBody : '', // html body
        });
        logs['EmailSentResponse'] = info;
        logger.info({ logs })
        return info;
    } catch (error) {
        logger.error({ details: error, logs })
    }
}
const commonReUsableFlowExeecution = async (executionFlow, flowData, spid, OwnerID = null, initialStartDateTime) => {
    const transaction = await sequelize.transaction();
    let initDateTime = initialStartDateTime ? initialStartDateTime : new Date().toISOString();
    const logs = { 'FlowExeecution': { executionFlow, flowData, spid } }
    try {
        const executeFlowStepWise = async (source, edges, details) => {
            logs['StepWiseExecution'] = { source, edges, details }
            const step = await details.find(x => x?.ShapeID == source);
            const childs = [], parents = []
            for await (const elm of edges) {
                if (elm.source == source) {
                    childs.push(elm)
                }
            }
            console.log('step', step, childs, edges)
            if (step.DetailsProperties.type == 'Start' || step.DetailsProperties.type == 'Yes' || step.DetailsProperties.type == 'No') {
                for await (const x of childs) {
                    await executeFlowStepWise(x.target, edges, details)
                }
            }
            if (step.DetailsProperties.type == 'Internal Form') {
                axios.post('http://3.144.118.25:9024/app-builder/common/v1/public/trigger-asset-user', {
                    data: step.DetailsProperties,
                    screen_id: step.DetailsProperties.screenId,
                    user_id: step.DetailsProperties.userId,
                })

                const [executedFlow, created] = await ExecutionFlowSteps.findOrCreate({
                    where: {
                        ExecutionFlowID: executionFlow.ExecutionFlowID,
                        ShapeID: source
                    },
                    defaults: {
                        StepValues: {
                            responseStatus: step.DetailsProperties.responseStatus
                        },
                        StepProperties: {
                            type: step.DetailsProperties.type
                        },
                        OwnerID: OwnerID
                    }
                }, { transaction })
                if (created) {
                    await flowExecutionUpdate(executionFlowStep.ExecutionFlowID, executionFlowStep.ShapeID, executionFlowStep.OwnerID)
                }
            }
            if (step.DetailsProperties.type == 'Create Form' || step.DetailsProperties.type == 'External Forms') {
                if (step) {
                    const { owner, startDate, notiFyAfter, endDate, title, remindBefore } = step.DetailsProperties;
                    const specificDate = new Date(startDate);
                    if (notiFyAfter) {
                        specificDate.setHours(specificDate.getHours() + notiFyAfter);
                    }
                    const emailPromises = [], emailBulkData = []
                    let existingData = null;
                    console.log(owner)
                    // if (UserID) {
                    //     existingData = await ExecutionFlowSteps.findOne({
                    //         where: {
                    //             ExecutionFlowID: executionFlow.ExecutionFlowID,
                    //             ShapeID: source,
                    //             OwnerID: UserID
                    //         }
                    //     })
                    // }
                    const ownerIds = [], actionUrls = {}
                    for await (const el of owner) {
                        ownerIds.push(el.UserID)
                        let url = ''
                        if (step.DetailsProperties.type == 'Create Form') {
                            url = `https://pluto.projectzerozilla.com/form/${executionFlow.ExecutionFlowID}/${source}/${el.UserID}`
                        } else {
                            url = step.DetailsProperties.linkUrl + '&cb=' + step.DetailsProperties.callbackUrl + '/' + el.UserID + '/' + executionFlow.ExecutionFlowID;
                        }
                        actionUrls[el.UserID] = url
                        const NotificationContent = `<div>
                            <div style="text-transform: capitalize;">Hi ${el?.UserFirstName} ${el?.UserMiddleName} ${el?.UserLastName},</div>
                            <p>Please verify data and submit the ${title} form using the hyper link</p>
                            <a href="${url}">Click here to verify submit the form</a>
                            <p>Thank you</p>`
                        emailBulkData.push({
                            ExecutionFlowID: executionFlow.ExecutionFlowID,
                            ShapeID: source,
                            Email: el.UserEmail,
                            Subject: title + ' Flow Is Not Submitted',
                            ScheduleDateAndTime: specificDate,
                            NotificationContent
                        })
                        if (endDate && remindBefore) {
                            const beforeDate = new Date(endDate);
                            beforeDate.setDate(beforeDate.getDate() - remindBefore)
                            emailBulkData.push({
                                ExecutionFlowID: executionFlow.ExecutionFlowID,
                                ShapeID: source,
                                Email: el.UserEmail,
                                Subject: title + ' Flow Is Not Submitted till now',
                                ScheduleDateAndTime: beforeDate,
                                NotificationContent
                            })
                        }
                        emailPromises.push(
                            dynamicSendEmail({
                                EmailRecipient: el.UserEmail,
                                EmailSubject: 'Verification and Update Request For ' + title,
                                BodyType: 'html',
                                MessageBody: NotificationContent,
                                CCEmails: [],
                                BCCEmails: []
                            })
                        );
                    }
                    // }

                    let manager = {};
                    const retryFetchApi = async () => {
                        try {
                            logs['RetryFetchApiStart'] = { owner }
                            const respData = await axios.post('https://apipluto.projectzerozilla.com/v1/pYaYk/k1Bz37WqsuMWaiz', { "UserIDs": ownerIds });
                            manager = respData.data;
                            logs['RetryFetchApiManagerDetails'] = manager
                            console.log(manager)
                            for await (const el of manager.data) {
                                const user = owner.find(x => x.UserID == el.EmpID);
                                const NotificationContentManager = `<div>
                                <div style="text-transform: capitalize;">Hi ${el?.UserFirstName} ${el?.UserMiddleName} ${el?.UserLastName},</div>
                                <p>Please Check on ${executionFlow.FlowName} for ${step.Title} task assigned to ${user?.UserFirstName} ${user?.UserMiddleName} ${user?.UserLastName} but that is not updated </p>
                                <P>So Please Update If nessasry else ignoor the mail</P>
                                <p>Thank you</p>
                                <p>Team</p>
                                </div>`
                                emailBulkData.push({
                                    ExecutionFlowID: executionFlow.ExecutionFlowID,
                                    ShapeID: source,
                                    Email: el.UserEmail,
                                    Subject: title + 'Flow Is Not Submitted',
                                    ScheduleDateAndTime: specificDate,
                                    NotificationContent: NotificationContentManager
                                })
                                if (endDate && remindBefore) {
                                    const beforeDate = new Date(endDate);
                                    beforeDate.setDate(beforeDate.getDate() - remindBefore)
                                    emailBulkData.push({
                                        ExecutionFlowID: executionFlow.ExecutionFlowID,
                                        ShapeID: source,
                                        Email: el.UserEmail,
                                        Subject: title + ' Flow Is Not Submitted till now',
                                        ScheduleDateAndTime: beforeDate,
                                        NotificationContent: NotificationContentManager
                                    })
                                }
                            }

                            return 'OK';
                        } catch (error) {
                            console.log(error)
                            logs['RetryFetchApiManagerDetailsFails'] = true
                            await retryFetchApi();
                            return 'OK';
                        }
                    }
                    await retryFetchApi();
                    logs['FortherNotificationSave'] = true
                    await SheduleNotification.bulkCreate(emailBulkData, { ignoreDuplicates: true })
                    logs['NotificationSaveSuccess'] = true
                    logs['MailNotificationSend'] = true
                    await Promise.all(emailPromises);
                    logs['MailNotificationSendSuccess'] = true
                    for await (const el of owner) {
                        if (step.DetailsProperties.type == 'External Forms') {
                            // if (existingData && existingData.StepStatus == 'Success') {
                            const completeTiming = new Date().toISOString();
                            await ExecutionFlowSteps.create({
                                ExecutionFlowID: executionFlow?.ExecutionFlowID,
                                ShapeID: step?.ShapeID,
                                StepNumber: step?.StepNumber,
                                StepName: step?.Title,
                                ServiceID: step?.ServiceID,
                                StepProperties: step?.DetailsProperties,
                                OwnerID: el?.UserID,
                                StepValues: null,
                                StepStatus: 'LinkActionRequired',
                                CreatedBy: step?.CreatedBy,
                                StepStartDate: initDateTime
                            })
                            initDateTime = completeTiming
                            // } else {
                            //     const completeTiming = new Date().toISOString();
                            //     await ExecutionFlowSteps.update({
                            //         StepStatus: 'LinkActionRequired',
                            //         StepStartDate: initDateTime
                            //     }, { where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID, OwnerID: ownerIds } }, { transaction });
                            //     initDateTime = completeTiming
                            // }
                        } else {
                            // if (existingData && existingData.StepStatus == 'Success') {
                            const completeTiming = new Date().toISOString();
                            await ExecutionFlowSteps.create({
                                ExecutionFlowID: executionFlow?.ExecutionFlowID,
                                ShapeID: step?.ShapeID,
                                StepNumber: step?.StepNumber,
                                StepName: step?.Title,
                                ServiceID: step?.ServiceID,
                                StepProperties: step?.DetailsProperties,
                                OwnerID: el?.UserID,
                                StepValues: null,
                                StepStatus: step.DetailsProperties.isEmailShared ? 'EmailActionRequired' : 'ActionRequired',
                                CreatedBy: step?.CreatedBy,
                                StepStartDate: initDateTime
                            })
                            initDateTime = completeTiming
                        }

                        // } else {
                        //     const completeTiming = new Date().toISOString();
                        //     await ExecutionFlowSteps.update({
                        //         StepStatus: step.DetailsProperties.isEmailShared ? 'EmailActionRequired' : 'ActionRequired',
                        //         StepStartDate: initDateTime,
                        //     },
                        //         { where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID, OwnerID: ownerIds } }, { transaction });
                        //     initDateTime = completeTiming
                        // }
                    }
                    const payload = []
                    for await (const el of ownerIds) {
                        payload.push({
                            ExecutionFlowID: executionFlow.ExecutionFlowID,
                            ShapeID: step.ShapeID,
                            UserID: el,
                            FlowID: executionFlow.FlowID,
                            FlowName: executionFlow.FlowName,
                            StepName: step.Title,
                            StartDate: startDate,
                            EndDate: endDate,
                            ActionURL: actionUrls[el],
                            CreatedBy: el
                        })
                    }
                    console.log(payload)
                    // await axios.post('https://apipluto.projectzerozilla.com/v1/pYaYk/E7IiDa7UocODtp0', { bulkData: payload });
                }
            }
            if (step.DetailsProperties.type == 'Concatenation') {
                const matches = step.DetailsProperties?.value?.match(/\{([^}]+)\}/g);
                const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                let updatedValue = step.DetailsProperties?.value
                const executableStepData = await ExecutionFlowSteps.findOne({
                    where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID, OwnerID: null }
                }, { transaction })
                if (results.length > 0) {
                    for await (const el of results) {
                        const splitData = el.split('.');
                        let field = splitData[1];
                        const id = splitData[0];
                        const data = await ExecutionFlowSteps.findOne({
                            where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                            attributes: ['StepValues', 'StepProperties']
                        }, { transaction })
                        if (data.StepProperties.type == 'Concatenation') {
                            updatedValue = updatedValue.replace(`{${el}}`, data.StepValues['value']);
                        } else {
                            updatedValue = updatedValue.replace(`{${el}}`, data.StepValues[field]);
                        }
                        // if (executableStepData) {
                        //     const completeTiming = new Date().toISOString();
                        //     await executableStepData.update({ StepStatus: 'Success', StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming, OwnerID: UserID },
                        //         { where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID } }, { transaction });
                        //     initDateTime = completeTiming
                        // } else {
                        const completeTiming = new Date().toISOString();
                        await ExecutionFlowSteps.create({
                            ...JSON.stringify(JSON.parse(executableStepData)),
                            StepStatus: 'Success', StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming, OwnerID: UserID
                        })
                        initDateTime = completeTiming
                        // }
                    }
                } else {
                    // if (executableStepData) {
                    //     const completeTiming = new Date().toISOString();
                    //     await executableStepData.update({ StepStatus: 'Success', StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming, OwnerID: UserID },
                    //         { where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID } }, { transaction });
                    //     initDateTime = completeTiming
                    // } else {
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.create({
                        ...JSON.stringify(JSON.parse(executableStepData)),
                        StepStatus: 'Success', StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming, OwnerID: UserID
                    })
                    initDateTime = completeTiming
                    // }
                }

                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'Split') {
                const matches = step.DetailsProperties?.position?.match(/\{([^}]+)\}/g);
                const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                let updatedValue = step.DetailsProperties?.position
                if (results.length > 0) {
                    let outputResult = {}
                    for await (const el of results) {
                        const splitData = el.split('.');
                        let field = splitData[1];
                        const id = splitData[0];
                        const data = await ExecutionFlowSteps.findOne({
                            where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                            attributes: ['StepValues', 'StepProperties']
                        }, { transaction })
                        if (data.StepProperties.type == 'Concatenation') {
                            outputResult[field] = data.StepValues['value'].split(step.DetailsProperties?.value);
                        } else if (data.StepProperties.type == 'Gmail') {
                            outputResult[field] = data.StepValues['responseStatus'].split(step.DetailsProperties?.value);
                        } else {
                            outputResult[field] = data.StepValues[field].split(step.DetailsProperties?.value);
                        }
                    }
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: outputResult }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                } else {
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                }

                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'Remove HTML') {
                const matches = step.DetailsProperties?.position?.match(/\{([^}]+)\}/g);
                const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                let updatedValue = step.DetailsProperties?.position
                if (results.length > 0) {
                    let outputResult = {}
                    for await (const el of results) {
                        const splitData = el.split('.');
                        let field = splitData[1];
                        const id = splitData[0];
                        const data = await ExecutionFlowSteps.findOne({
                            where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                            attributes: ['StepValues', 'StepProperties']
                        }, { transaction })
                        if (data.StepProperties.type == 'Concatenation') {
                            outputResult[field] = data.StepValues['value'].replace(/<[^>]*>/g, '');
                        } else if (data.StepProperties.type == 'Gmail') {
                            outputResult[field] = data.StepValues['responseStatus'].replace(/<[^>]*>/g, '');
                        } else {
                            outputResult[field] = data.StepValues[field].replace(/<[^>]*>/g, '');
                        }
                    }
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: outputResult }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                } else {
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                }
                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }
            }
            if (step.DetailsProperties.type == 'Replace') {
                const matches = step.DetailsProperties?.position?.match(/\{([^}]+)\}/g);
                const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                let updatedValue = step.DetailsProperties?.position
                let withValue = step.DetailsProperties?.withValue
                let value = step.DetailsProperties?.value
                if (results.length > 0) {
                    let outputResult = {}
                    for await (const el of results) {
                        const splitData = el.split('.');
                        let field = splitData[1];
                        const id = splitData[0];
                        const data = await ExecutionFlowSteps.findOne({
                            where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                            attributes: ['StepValues', 'StepProperties']
                        }, { transaction })
                        if (data.StepProperties.type == 'Concatenation') {
                            outputResult[field] = data.StepValues['value'].replace(value, withValue);
                        } else if (data.StepProperties.type == 'Gmail') {
                            outputResult[field] = data.StepValues['responseStatus'].replace(value, withValue);
                        } else {
                            outputResult[field] = data.StepValues[field].replace(value, withValue);
                        }
                    }
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: outputResult }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                } else {
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                }
                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'Find') {
                const matches = step.DetailsProperties?.position?.match(/\{([^}]+)\}/g);
                const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                let updatedValue = step.DetailsProperties?.position
                let value = step.DetailsProperties?.value
                if (results.length > 0) {
                    let outputResult = {}
                    for await (const el of results) {
                        const splitData = el.split('.');
                        let field = splitData[1];
                        const id = splitData[0];
                        const data = await ExecutionFlowSteps.findOne({
                            where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                            attributes: ['StepValues', 'StepProperties']
                        }, { transaction })
                        if (data.StepProperties.type == 'Concatenation') {
                            outputResult[field] = data.StepValues['value'].includes(value);
                        } else if (data.StepProperties.type == 'Gmail') {
                            outputResult[field] = data.StepValues['responseStatus'].includes(value);
                        } else {
                            outputResult[field] = data.StepValues[field].includes(value);
                        }
                    }
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: outputResult }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                } else {
                    const completeTiming = new Date().toISOString();
                    await ExecutionFlowSteps.update({
                        StepStatus: 'Success',
                        StepValues: { value: updatedValue }, StepStartDate: initDateTime, StepEndDate: completeTiming
                    },
                        {
                            where: {
                                ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID
                            }
                        }, { transaction });
                    initDateTime = completeTiming
                }

                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'Email') {
                let updatedValue = step.DetailsProperties
                const NodeID = step.ShapeID;
                for await (const [k, v] of Object.entries(step.DetailsProperties)) {
                    if (typeof v === 'string') {
                        const matches = v?.match(/\{([^}]+)\}/g);
                        const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                        let keyValue = v;
                        if (results.length > 0) {
                            for await (const el of results) {
                                const splitData = el.split('.');
                                let field = splitData[1];
                                const id = splitData[0];
                                const data = await ExecutionFlowSteps.findOne({
                                    where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                                    attributes: ['StepValues', 'StepProperties']
                                }, { transaction })
                                if (data.StepProperties.type == 'Concatenation') {
                                    keyValue = keyValue.replace(`{${el}}`, data.StepValues['value']);
                                } else if (data.StepProperties.type == 'Gmail') {
                                    keyValue = keyValue.replace(`{${el}}`, data.StepValues['responseStatus']);
                                } else {
                                    keyValue = keyValue.replace(`{${el}}`, data.StepValues[field]);
                                }
                            }
                        }
                        updatedValue[k] = keyValue;
                    }
                }
                dynamicSendEmail(updatedValue);
                const completeTiming = new Date().toISOString();
                const dateValues = { StepStartDate: initDateTime }
                if (!updatedValue?.ActionRequired) {
                    dateValues.StepEndDate = completeTiming
                }
                await ExecutionFlowSteps.create({
                    ExecutionFlowID: executionFlow.ExecutionFlowID,
                    ShapeID: step.ShapeID,
                    ShapeType: step.ShapeType,
                    StepName: step.Title,
                    ServiceID: step.ServiceID,
                    StepNumber: step.StepNumber,
                    StepProperties: step.DetailsProperties,
                    StepValues: updatedValue, StepStartDate: initDateTime, StepEndDate: completeTiming,
                    OwnerID,
                    StepStatus: 'Success',
                    CreatedBy: OwnerID ? OwnerID : step.CreatedBy,
                })
                initDateTime = completeTiming

                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'If Else Clause') {
                let dataArray = []
                for await (const el of step.DetailsProperties.rows) {
                    let updatedValue = el
                    for await (const [k, v] of Object.entries(el)) {
                        if (typeof v === 'string') {
                            const matches = v?.match(/\{([^}]+)\}/g);
                            const results = matches ? matches.map(match => match.slice(1, -1)) : [];
                            let keyValue = v;
                            if (results.length > 0) {
                                for await (const el of results) {
                                    const splitData = el.split('.');
                                    let field = splitData[1];
                                    const id = splitData[0];
                                    const data = await ExecutionFlowSteps.findOne({
                                        where: { ShapeID: id, ExecutionFlowID: executionFlow.ExecutionFlowID },
                                        attributes: ['StepValues', 'StepProperties', 'StepStatus']
                                    }, { transaction })
                                    if (data.StepProperties.type == 'Concatenation') {
                                        keyValue = keyValue.replace(`{${el}}`, data.StepValues['value']);
                                    } else if (data.StepProperties.type == 'Gmail') {
                                        keyValue = keyValue.replace(`{${el}}`, data.StepValues['responseStatus']);
                                    } else {
                                        if (field == 'NodeExcutionSatus') {
                                            keyValue = keyValue.replace(`{${el}}`, data.StepStatus);
                                        } else {
                                            keyValue = keyValue.replace(`{${el}}`, data.StepValues[field]);
                                        }
                                    }
                                }
                            }
                            updatedValue[k] = keyValue;
                        }
                    }
                    dataArray.push(updatedValue);
                }

                const validateCondition = async (prevStatus, join, obj) => {
                    if (!(obj?.value1 || obj?.value2)) {
                        return true
                    }
                    if ((obj?.value1 || obj?.value2) && (!(obj?.value1 && obj?.value2))) {
                        return false
                    }
                    if (obj.operation == "Equals" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || obj.value1 == obj.value2
                    }
                    if (obj.operation == "Equals" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && obj.value1 == obj.value2
                    }
                    if (obj.operation == "Not Equals" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || obj.value1 != obj.value2
                    }
                    if (obj.operation == "Not Equals" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && obj.value1 != obj.value2
                    }
                    if (obj.operation == "Contains" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || obj.value1.includes(obj.value2)
                    }
                    if (obj.operation == "Contains" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && obj.value1.includes(obj.value2)
                    }
                    if (obj.operation == "Does Not Contain" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || (!obj.value1.includes(obj.value2))
                    }
                    if (obj.operation == "Does Not Contain" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && (!obj.value1.includes(obj.value2))
                    }
                    if (obj.operation == "Starts With" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || obj.value1.startWith(obj.value2)
                    }
                    if (obj.operation == "Starts With" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && obj.value1.startWith(obj.value2)
                    }
                    if (obj.operation == "Ends With" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || obj.value1.endWith(obj.value2)
                    }
                    if (obj.operation == "Ends With" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && obj.value1.endWith(obj.value2)
                    }
                    if (obj.operation == "Match Regex" && join == 'OR' && obj.value1 && obj.value2) {
                        return prevStatus || new RegExp(obj.value2).test(obj.value1)
                    }
                    if (obj.operation == "Match Regex" && join == 'AND' && obj.value1 && obj.value2) {
                        return prevStatus && new RegExp(obj.value2).test(obj.value1)
                    }
                    return prevStatus
                }
                let resultStatus = 'No';
                if (step.DetailsProperties.joinType == 'OR') {
                    let pStatus = false

                    for await (const el of dataArray) {
                        if (!pStatus)
                            pStatus = await validateCondition(pStatus, 'OR', el)
                    }

                    if (pStatus) {
                        resultStatus = 'Yes';
                    } else {
                        resultStatus = 'No';
                    }
                }
                if (step.DetailsProperties.joinType == 'AND') {
                    let pStatus = true
                    for await (const el of dataArray) {
                        if (pStatus) {
                            let val = await validateCondition(pStatus, 'AND', el)
                            pStatus = val
                        }
                    }
                    if (pStatus) {
                        resultStatus = 'Yes';
                    } else {
                        resultStatus = 'No';
                    }
                }
                const completeTiming = new Date().toISOString();
                await ExecutionFlowSteps.create({
                    ExecutionFlowID: executionFlow.ExecutionFlowID,
                    ShapeID: step.ShapeID,
                    ShapeType: step.ShapeType,
                    StepName: step.Title,
                    ServiceID: step.ServiceID,
                    StepNumber: step.StepNumber,
                    StepProperties: step.DetailsProperties,
                    StepValues: {
                        ...step.DetailsProperties, rows: dataArray, resultStatus
                    }, StepStartDate: initDateTime, StepEndDate: completeTiming,
                    OwnerID,
                    StepStatus: 'Success',
                    CreatedBy: OwnerID ? OwnerID : step.CreatedBy,
                })
                initDateTime = completeTiming;
                for await (const el of childs) {
                    if (el.target == step?.ShapeID + resultStatus)
                        await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'Call Rest API') {
                const completeTiming = new Date().toISOString();
                await ExecutionFlowSteps.update({
                    StepStatus: 'Success', StepStartDate: initDateTime, StepEndDate: completeTiming
                }, { where: { ShapeID: step.ShapeID, ExecutionFlowID: executionFlow.ExecutionFlowID } }, { transaction });

                initDateTime = completeTiming
                for (const el of childs) {
                    await executeFlowStepWise(el.target, edges, details)
                }

            }
            if (step.DetailsProperties.type == 'End') {
                const completeTiming = new Date().toISOString();
                await ExecutionFlow.update({
                    Status: 'Completed',
                    EndDate: completeTiming
                }, {
                    where: { ExecutionFlowID: executionFlow.ExecutionFlowID },
                })
            }

            flowExecutionUpdate(executionFlow.FlowID);
            logs['StepWiseExecutionSuccess'] = true
            return 'OK';
        }
        await executeFlowStepWise(spid, flowData.FlowNodeEdgesDetails, flowData.Details);
        await transaction.commit();
        logs['FlowExeecutionSuccess'] = true
        logger.info({ logs })
        return 'Ok'
    } catch (error) {
        console.log(error)
        logger.error({ details: error, logs })
        await transaction.rollback();
        return 'Faild'
    }
}

exports.emailResponse = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { id, shapeid } = req.params;
        const { remarks, status } = req.body;
        const data = await ExecutionFlowSteps.update({
            StepValues: { responseStatus: status, responseMessage: remarks },
            StepStatus: 'Success', StepStartDate: FlowStarted, StepEndDate: literal('CURRENT_TIMESTAMP')
        }, {
            where: {
                ExecutionFlowID: id,
                ShapeID: shapeid,
                StepStatus: 'WaitForEmailResponse'
            },
        })
        if (data[0]) {
            const flow = await ExecutionFlow.findByPk(id, {
                include: [{
                    model: Flow,
                    as: 'Flow',
                    include: [{
                        model: FlowDetails,
                        as: 'Details'
                    }]
                }]
            });
            const flowData = JSON.parse(JSON.stringify(flow));
            for (const el of flowData.Flow.FlowNodeEdgesDetails) {
                if (el.source == shapeid) {
                    commonReUsableFlowExeecution(flowData, flowData.Flow, el.target, null, FlowStarted);
                }
            }
            res.status(200).send({ message: "Email response submitted successfully" });
        } else {
            res.status(400).send({ message: "Response already submitted" });
        }
    } catch (error) {
        res.status(400).send({ message: error.message })
    }
}
exports.sendEmails = async (req, res) => {
    const logs = {}
    try {
        const { EmailRecipient = [], EmailSubject, BodyType, MessageBody, CCEmails = [], BCCEmails = [] } = req.body;
        logs['EmailBody'] = req.body
        const info = await transporter.sendMail({
            from: '"CLYKOPS" <pluto@zerozilla.com>', // sender address
            to: EmailRecipient.join(','), // list of receivers
            subject: EmailSubject, // Subject line
            cc: CCEmails.join(','), //
            bcc: BCCEmails.join(','),
            // attachments:{
            //     filename: req.file.OriginalName,
            //     content: req.file.buffer
            // },
            text: BodyType == 'text' ? MessageBody : '', // plain text body
            html: BodyType == 'html' ? MessageBody : '', // html body
        });
        res.status(200).send({ message: "Email sent successfully" });
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
}

exports.executionHistory = async (req, res) => {
    try {
        const { UserID } = req.body;
        let where = sequelize.literal("`ExecutionFlow`.`IsDeleted` = false")

        if (UserID) {
            where = sequelize.literal(
                "`ExecutionFlow`.`IsDeleted` = false AND JSON_EXTRACT(`Steps`.`StepProperties`, '$.owner.UserID') = '" + UserID + "'"
            );
        }

        const executionHistory = await ExecutionFlow.findAll({
            where: where,
            include: {
                model: ExecutionFlowSteps,
                as: 'Steps',
                where: {
                    IsDeleted: false,
                },
                attributes: {
                    exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate'],
                },
            },
            attributes: ['ExecutionFlowID', 'FlowID', 'FlowName', 'StartDate', 'EndDate', 'ErrorMessage', 'RetryCount'],
            order: [['StartDate', 'DESC']],
        });
        const executeData = JSON.parse(JSON.stringify(executionHistory));
        for await (const elm of executeData) {
            const steps = elm.Steps;
            const executedSteps = steps?.filter(step => step.StepStatus != 'Pending');
            const latestStatus = executedSteps?.find(step => step.StepStatus != 'Success')
            delete elm.Steps;
            elm.LatestStatus = !latestStatus && executedSteps.length ? 'Completed' : latestStatus?.StepStatus ? latestStatus?.StepStatus : 'Pending';
            elm.ExecutedStepsCount = executedSteps?.length;
            elm.TotalSteps = steps?.length;
            elm.ExecutionDuration = !!elm.EndDate ? (new Date(elm.EndDate).getTime() - new Date(elm.StartDate).getTime()) / 1000 : 0;
            elm.CompletedStepCount = executedSteps?.filter(step => step.StepStatus == 'Success').length;
            elm.PendingStepCount = steps?.filter(step => step.StepStatus == 'Pending').length;
        }
        res.status(200).send({ executionHistory: executeData });
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
}

exports.executionRetry = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { FlowID } = req.body;
        const flowDetails = await Flow.findByPk(FlowID, {
            include: [{
                model: FlowDetails,
                as: 'Details',
            }]
        });
        const flowData = JSON.parse(JSON.stringify(flowDetails));
        if (new Date(flowData.AccessStartDate) > new Date() && new Date(flowData.AccessEndDate) < new Date()) {
            return res.status(200).send({ message: "Flow Execution out of Aceess Date" });

        }
        let executionFlow = await ExecutionFlow.findOne({
            where: {
                FlowID
            },
            order: [['CreatedDate', 'DESC']],
        })
        const executeData = JSON.parse(JSON.stringify(executionFlow))
        if (flowData.ExecutionType == 'single' && executionFlow) {
            return res.status(200).send({ message: "Flow already executed" });
        } else if (flowData.ExecutionType == 'daily' && executionFlow) {
            if (executionFlow.StartDate.slice(0, 10) == new Date().toISOString().slice(0, 10)) {
                return res.status(200).send({ message: "Flow already executed for the day" });
            }
        } else if (flowData.ExecutionType == 'weekly' && executionFlow) {
            const now = new Date();
            const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
            const lastDayOfWeek = new Date(now.setDate(firstDayOfWeek.getDate() + 6));

            if (new Date(executionFlow.StartDate) < firstDayOfWeek && new Date(executionFlow.StartDate) > lastDayOfWeek) {
                return res.status(200).send({ message: "Flow already executed for the week" });
            }
        } else if (flowData.ExecutionType == 'monthly' && executionFlow) {
            const currentDate = new Date();
            const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            if (new Date(executionFlow.StartDate) < firstDayOfMonth && new Date(executionFlow.StartDate) > lastDayOfMonth) {
                return res.status(200).send({ message: "Flow already executed for the month" });
            }
        } else if (flowData.ExecutionType == 'yearly' && executionFlow) {
            const currentDate = new Date();
            const firstDayOfYear = new Date(currentDate.getFullYear(), 0, 1);
            const lastDayOfYear = new Date(currentDate.getFullYear(), 11, 31);
            if (new Date(executionFlow.StartDate) < firstDayOfYear && new Date(executionFlow.StartDate) > lastDayOfYear) {
                return res.status(200).send({ message: "Flow already executed for the year" });
            }
        }
        executionFlow = await ExecutionFlow.create({
            FlowID,
            FlowName: flowData.FlowName,
            StartDate: FlowStarted,
            EndDate: null,
            FlowVersion: flowData.Version,
            Version: executeData.FlowVersion == flowData.Version ? executeData.Version : 1 + executeData.Version,
            NodePositionDetails: flowData.FlowNodePositionDetails,
            NodeEdgesDetails: flowData.FlowNodeEdgesDetails,
            Status: 'Execution Started',
            CreatedBy: flowData.CreatedBy
        }, { returning: true });
        const Istep = await flowData.Details.find(x => x.DetailsProperties.type == 'Start');
        console.log(Istep)
        await commonReUsableFlowExeecution(executionFlow, flowData, Istep?.ShapeID, null, FlowStarted);

        res.status(200).send({ message: "Flow execution started successfully" });
    } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message });
    }
}
exports.executeFlow = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { FlowID, CreatedBy } = req.body;
        const flowDetails = await Flow.findByPk(FlowID, {
            include: [{
                model: FlowDetails,
                as: 'Details',
            }]
        });
        const flowData = JSON.parse(JSON.stringify(flowDetails));
        const executionFlow = await ExecutionFlow.create({
            FlowID,
            FlowName: flowData.FlowName,
            StartDate: FlowStarted,
            EndDate: null,
            Status: 'Execution Started',
            Version: flowData.Version,
            NodePositionDetails: flowData.FlowNodePositionDetails,
            NodeEdgesDetails: flowData.FlowNodeEdgesDetails,
            CreatedBy
        }, { returning: true });
        const executableSteps = [];
        for await (const el of flowDetails.Details) {
            executableSteps.push({
                ExecutionFlowID: executionFlow.ExecutionFlowID,
                ShapeID: el.ShapeID,
                StepNumber: el.StepNumber,
                StepName: el.Title,
                ServiceID: el.ServiceID,
                StepProperties: el.DetailsProperties,
                StepValues: null,
                StepStatus: 'Pending',
                CreatedBy
            })
        }
        await ExecutionFlowSteps.bulkCreate(executableSteps);
        let IstSteps = [];
        if (flowData.Details.length > 1) {
            IstSteps = await flowData.Details.filter(step => flowData.FlowNodeEdgesDetails.some(x => x.source === step.ShapeID) && (!flowData.FlowNodeEdgesDetails.some(x => x.target == step.ShapeID)));
        } else if (flowData.Details.length == 1) {
            IstSteps = flowData.Details;
        }
        for await (const el of IstSteps) {
            await commonReUsableFlowExeecution(executionFlow, flowData, el.ShapeID, null, FlowStarted);
        }
        const executionData = await ExecutionFlow.findOne({
            where: { ExecutionFlowID: executionFlow.ExecutionFlowID },
            attributes: {
                exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
            },
            include: [{
                model: ExecutionFlowSteps, as: 'Steps', required: false,
                attributes: ['StepStatus', 'ShapeID']
            },
            {
                model: Flow, as: 'Flow', required: false,
                attributes: {
                    exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                },
            }],
        });
        const executeData = JSON.parse(JSON.stringify(executionData));
        const steps = executeData.Steps;
        for await (const el of executeData.Flow.FlowNodePositionDetails) {
            const step = await steps.find(x => x.ShapeID == el.id);
            el.data.StepStatus = step?.StepStatus;
        }
        delete executeData.Steps;
        res.status(200).send({ message: "Flow execution started successfully", executionFlow: executeData });
    } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message });
    }
}
exports.executedFlow = async (req, res) => {
    const logs = {}
    const FlowStarted = new Date().toISOString();
    try {
        const { CreatedBy, ...otherDetails } = req.body;
        let FlowID = req.body.FlowID || null;
        if (otherDetails.ownerId || otherDetails.FlowName || otherDetails.FLowDescription || otherDetails.StartDate || otherDetails.EndDate) {
            if (otherDetails.ownerId && otherDetails.FlowName && otherDetails.FLowDescription && otherDetails.StartDate && otherDetails.EndDate) {
                let user = {};
                const retryFetchApi = async () => {
                    try {
                        logs['RetryFetchApiStart'] = { owner }
                        const respData = await axios.post('https://apipluto.projectzerozilla.com/v1/pYaYk/PnKINXQWuY4oI56', { "UserID": owner?.UserID });
                        user = respData.data;
                        logs['RetryFetchApiUserDetails'] = user
                        logs['RetryFetchApiUserDetailsSuccess'] = true
                        return 'OK';
                    } catch (error) {
                        console.log(error)
                        logs['RetryFetchApiUserDetailsFails'] = error
                        await retryFetchApi();
                        return 'OK';
                    }
                }
                await retryFetchApi();
                if (user.data.UserID) {
                    logs['CreatingNewFlow'] = true
                    const [createdFlow, created] = await Flow.findOrCreate({
                        where: { FlowName: otherDetails.FlowName }, // Search condition
                        defaults: {
                            FlowName: otherDetails.FlowName,
                            FlowDescription: otherDetails.FlowDescription,
                            ExecutionType: otherDetails.ExecutionType,
                            IsAllowMultiUsers: otherDetails.IsAllowMultiUsers,
                            OwnerID: user.data.UserID,
                            OwnerEmail: user.data.UserEmail,
                            OwnerName: `${user.data.UserFirstName} ${user.data.UserMiddleName} ${user.data.UserLastName}`,
                            AccessStartDate: otherDetails.StartDate,
                            AccessEndDate: otherDetails.EndDate,
                            CreatedBy,
                            Version: literal('"Version" + 1')
                        },
                        returning: true, // Ensures that createdFlow includes all attributes
                    });
                    FlowID = createdFlow.FlowID;
                    logs['CreatedFlowSuccess'] = true
                }
            } else {
                res.status(400).send({ message: "Missing required parameters" });
                return;
            }
        }

        const flowDetails = await Flow.findByPk(FlowID, {
            include: [{
                model: FlowDetails,
                as: 'Details',
            }]
        });
        const flowData = JSON.parse(JSON.stringify(flowDetails));
        if (new Date(flowData?.AccessStartDate) > new Date() && new Date(flowData?.AccessEndDate) < new Date() && flowData?.AccessStartDate && flowData?.AccessEndDate) {
            return res.status(200).send({ message: "Flow Execution out of Aceess Date" });

        }
        let executionFlow = await ExecutionFlow.findOne({
            where: {
                FlowID
            }
        })
        if (!executionFlow) {
            executionFlow = await ExecutionFlow.create({
                FlowID,
                FlowName: flowData.FlowName,
                StartDate: FlowStarted,
                EndDate: null,
                Status: 'Execution Started',
                FlowVersion: flowData.Version,
                Version: 1,
                NodePositionDetails: flowData.FlowNodePositionDetails,
                NodeEdgesDetails: flowData.FlowNodeEdgesDetails,
                CreatedBy,
            }, { returning: true });
            const Istep = await flowData.Details.find(x => x.DetailsProperties.type == 'Start');
            await commonReUsableFlowExeecution(executionFlow, flowData, Istep?.ShapeID, null, FlowStarted);
        }
        res.status(200).send({ message: "Flow execution started successfully" });
    } catch (error) {
        console.log(error)
        logger.error({ details: error, logs })
        res.status(500).send({ message: error.message });
    }
}
exports.getRefreshData = async (req, res) => {
    try {
        const { ExecutionFlowID } = req.body;
        const executionData = await ExecutionFlow.findByPk(ExecutionFlowID, {
            attributes: {
                exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
            },
            include: [{
                model: ExecutionFlowSteps, as: 'Steps', required: false,
                attributes: ['StepStatus', 'ShapeID', 'StepEndDate']
            },
            {
                model: Flow, as: 'Flow', required: false,
                attributes: {
                    exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                },
                include: {
                    model: FlowDetails, as: 'Details',
                    attributes: {
                        exclude: ['CreatedBy', 'CreatedDate', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                    },
                    required: false
                },
            }],
        });
        const executeData = JSON.parse(JSON.stringify(executionData));
        const steps = executeData?.Steps;
        const positionDetails = JSON.parse(JSON.stringify(executeData.Flow.FlowNodePositionDetails));
        executeData.Flow.FlowNodePositionDetails = executeData.NodePositionDetails;
        executeData.Flow.FlowNodeEdgesDetails = executeData.NodeEdgesDetails;
        for await (const el of positionDetails) {
            let step = await steps.find(x => x.ShapeID == el.id && x.StepStatus != 'Success' && x.StepStatus != 'Pending');
            if (!step) {
                step = await steps.find(x => x.ShapeID == el.id && x.StepStatus == 'Success');
            }
            if (!step) {
                step = await steps.find(x => x.ShapeID == el.id);
            }
            if (step) {
                const index = executeData.Flow.FlowNodePositionDetails.findIndex(x => x.id == step.ShapeID);
                if (index !== -1) {
                    executeData.Flow.FlowNodePositionDetails[index].data.StepStatus = step?.StepStatus;
                }
            }
        }
        const stepIdStatus = {}
        for await (const x of executeData?.Steps) {
            if (!Array.isArray(stepIdStatus[x.ShapeID])) {
                stepIdStatus[x.ShapeID] = []
            }
            stepIdStatus[x.ShapeID].push(x.StepStatus)
        }
        executeData['CompletedStepCount'] = 0
        for await (const [k, v] of Object.entries(stepIdStatus)) {
            if (v.every(x => x == 'Success')) {
                executeData['CompletedStepCount'] += 1
            }
        }
        let flowTrueLength = 0;
        const getValidFlowPath = async (edg) => {
            const target = await executeData.Flow?.FlowNodeEdgesDetails.filter(x => x.source == edg.target);
            for await (const el of target) {
                if (el.target.includes('end-')) {
                    return 'ok'
                } else {
                    const trgt = await steps.find(x => x.ShapeID === el.source);
                    if (el.source.includes('No') && trgt) {
                        flowTrueLength++;
                        return await getValidFlowPath(el);
                    } else if (!el.source.includes('No')) {
                        flowTrueLength++;
                        return await getValidFlowPath(el);
                    } else {
                        return 'ok'
                    }
                }
            }
        }
        const startEdge = await executeData.Flow?.FlowNodeEdgesDetails.find(x => x.source.includes('start-'));
        await getValidFlowPath(startEdge)
        executeData['TotalSteps'] = executeData.Status == 'Completed' ? executeData['CompletedStepCount'] : flowTrueLength,
            executeData['EndDate'] = executeData.endDate ? executeData.endDate : steps.find(x => x.StepStatus != 'Success' && x.StepStatus != 'Pending') ? null : executeData.Steps.reduce((max, item) =>
                new Date(item.StepEndDate) > new Date(max.StepEndDate) ? item : max
            ).StepEndDate;
        delete executeData.Steps;
        res.status(200).send({ executionFlow: executeData });
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
}

exports.executeStep = async (req, res) => {
    try {
        const { ExecutionFlowStepID, ExecutionFlowID,
            StepOrder,
            StepName,
            ServiceID,
            StepDescription,
            StepProperties, CreatedBy } = req.body;
        if (ExecutionFlowStepID) {
            const executionFlow = await ExecutionFlowSteps.findByPk(ExecutionFlowStepID);
            await executionFlow.update({
                ExecutionFlowID,
                StepOrder,
                StepName,
                ServiceID,
                StepDescription,
                StepProperties,
                CreatedBy
            });
        } else {
            await ExecutionFlowSteps.create({
                ExecutionFlowID,
                StepOrder,
                StepName,
                ServiceID,
                StepDescription,
                StepProperties,
                CreatedBy
            });
        }
        res.status(200).send({ message: "Step Executed Successfully" });
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
}

exports.formSubmit = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { ExecutionFlowID, UserID, ShapeID, CreatedBy, ...FormValues } = req.body;
        console.log(UserID)
        const data = await ExecutionFlowSteps.update({
            StepValues: FormValues,
            StepEndDate: FlowStarted,
            StepStatus: 'Success',
            ModifiedBy: CreatedBy,
            ModifiedDate: literal('CURRENT_TIMESTAMP')
        }, {
            where: {
                ExecutionFlowID, ShapeID, OwnerID: UserID, StepStatus: {
                    [Op.in]: ['EmailActionRequired',
                        'ActionRequired']
                }
            }
        });
        console.log(data)
        if (data[0]) {
            const flow = await ExecutionFlow.findByPk(ExecutionFlowID, {
                include: [{
                    model: Flow,
                    as: 'Flow',
                    include: [{
                        model: FlowDetails,
                        as: 'Details'
                    }]
                }]
            });
            const flowData = JSON.parse(JSON.stringify(flow));
            for (const el of flowData.Flow.FlowNodeEdgesDetails) {
                if (el.source == ShapeID) {
                    await commonReUsableFlowExeecution(flowData, flowData.Flow, el.target, UserID, FlowStarted);
                }
            }
            flowExecutionUpdate(flow.FlowID);
        }
        await axios.post('https://apipluto.projectzerozilla.com/v1/pYaYk/N3WG6D6ZGPcXe59', {
            ExecutionFlowID,
            ShapeID,
            UserID
        });
        res.status(200).send({ message: data[0] ? "Form submitted successfully" : 'Form Already Submitted', status: !!data[0] });
    } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message })
    }
}

exports.getSharedData = async (req, res) => {
    try {
        const { ExecutionFlowID, ShapeID } = req.body;
        const data = await ExecutionFlow.findOne({
            where: { ExecutionFlowID },
            include: [{
                model: Flow,
                as: 'Flow',
                include: [{
                    model: FlowDetails,
                    as: 'Details'
                }]
            }, {
                model: ExecutionFlowSteps,
                as: 'Steps',
                attributes: ['StepProperties', 'StepStatus', 'StepValues', 'StepStartDate', 'StepEndDate', 'StepName', 'ShapeID'],
                required: false
            }]
        })
        const responseData = []

        for (const el of data?.Steps) {
            if (el.StepProperties.type == 'External Forms' && el.StepValues) {
                for await (const x of el.StepProperties.owner) {
                    responseData.push({
                        title: el.StepName,
                        values: el.StepValues,
                        owner: x,
                        startDate: el.StepStartDate,
                        endDate: el.StepEndDate
                    });
                }
            }
            if (el.StepProperties.type == 'Create Form' && el.StepValues && el?.StepProperties?.sharedFields && el?.StepProperties?.sharedFields?.[el.ShapeID]?.length) {
                const keyValues = {}
                for await (const x of el?.StepProperties?.sharedFields?.[el.ShapeID]) {
                    keyValues[x] = el.StepValues[x]
                }
                responseData.push({
                    title: el.StepName,
                    values: keyValues,
                    owner: x,
                    startDate: el.StepStartDate,
                    endDate: el.StepEndDate
                });
            }
        }

        const step = await JSON.parse(JSON.stringify(data.Steps)).find(step => step.ShapeID == ShapeID);
        res.status(200).send({
            data: {
                ...data.Flow.Details.find(flow => flow.ShapeID == ShapeID).DetailsProperties,
                StepStatus: data?.StepStatus ? data?.StepStatus : 'Pending',
                StepValues: step?.StepValues
            }, value: responseData
        });
    } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message })
    }
}

exports.webhookCallbacks = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { FlowID, ShapeID } = req.params
        const { ExecutionFlowID = null } = req.body;
        const flow = await Flow.findByPk(FlowID, {
            include: [{
                model: FlowDetails,
                as: 'Details',
            }]
        })
        const flowData = JSON.parse(JSON.stringify(flow));
        const IstSteps = await flowData.Details.filter(step => flowData.FlowNodeEdgesDetails.some(x => x.source === step.ShapeID) && (!flowData.FlowNodeEdgesDetails.some(x => x.target != step.ShapeID)));
        if (ExecutionFlowID) {
            const executionFlow = await ExecutionFlow.findByPk(ExecutionFlowID, {
                include: {
                    model: ExecutionFlowSteps,
                    as: 'Steps',
                    where: { ShapeID },
                    required: false
                }
            });
            await commonReUsableFlowExeecution(executionFlow, flowData, ShapeID, null, FlowStarted)
        } else if (IstSteps.some(x => x.ShapeID == ShapeID)) {
            const executionFlow = await ExecutionFlow.create({
                FlowID,
                FlowName: flowData.FlowName,
                StartDate: FlowStarted,
                EndDate: null,
                Status: 'Execution Started',
                Version: flowData.Version,
                NodePositionDetails: flowData.FlowNodePositionDetails,
                NodeEdgesDetails: flowData.FlowNodeEdgesDetails,
                CreatedBy
            }, { returning: true });
            const executableSteps = [];
            for await (const el of flowData.Details) {
                executableSteps.push({
                    ExecutionFlowID: executionFlow.ExecutionFlowID,
                    ShapeID: el.ShapeID,
                    StepNumber: el.StepNumber,
                    StepName: el.Title,
                    ServiceID: el.ServiceID,
                    StepProperties: el.DetailsProperties,
                    StepValues: null,
                    StepStatus: 'Pending',
                    CreatedBy: el.CreatedBy
                })
            }
            await ExecutionFlowSteps.bulkCreate(executableSteps);
            await commonReUsableFlowExeecution(executionFlow, flowData, ShapeID, null, FlowStarted);
        }
        res.status(200).send({ message: "Webhook Callbacks Executed Successfully" });
    } catch (error) {
        res.status(500).send({ message: error.message })
    }
}

exports.formApiCallBack = async (req, res) => {
    const FlowStarted = new Date().toISOString();
    try {
        const { FlowID, ShapeID, UserID, ExecutionFlowID } = req.params;
        const { FormValues } = req.body;
        console.log(FlowID, ShapeID, UserID, FormValues)
        const data = await ExecutionFlow.findOne({
            where: { ExecutionFlowID },
            include: [{
                model: ExecutionFlowSteps,
                as: 'Steps',
                where: { ShapeID },
                required: false
            },
            {
                model: Flow,
                as: 'Flow',
                required: false,
                include: {
                    model: FlowDetails,
                    as: 'Details',
                    required: false
                }
            }]
        });
        const flowData = JSON.parse(JSON.stringify(data));

        const updateData = await ExecutionFlowSteps.update({
            StepValues: FormValues,
            StepEndDate: FlowStarted,
            StepStatus: 'Success',
            ModifiedBy: flowData.CreatedBy,
            ModifiedDate: literal('CURRENT_TIMESTAMP')
        }, {
            where: { ExecutionFlowID, ShapeID, StepStatus: 'LinkActionRequired', OwnerID: UserID }
        });
        if (updateData[0]) {
            for (const el of flowData.Flow.FlowNodeEdgesDetails) {
                console.log(el.source, ShapeID)
                if (el.source == ShapeID) {
                    await commonReUsableFlowExeecution(flowData, flowData.Flow, el.target, UserID, FlowStarted);
                }
            }
        }
        flowExecutionUpdate(data.FlowID);
        await axios.post('https://apipluto.projectzerozilla.com/v1/pYaYk/N3WG6D6ZGPcXe59', {
            ExecutionFlowID,
            ShapeID,
            UserID
        });
        res.status(200).send({ message: "Form submitted successfully" });
    } catch (e) {
        console.error(e);
        res.status(500).send({ message: e.message });
    }
}
exports.startFrowOnAppBuilderFormSubmit = async () => {
    try {
        const { FlowID } = req.body;
        const FlowStarted = new Date().toISOString();


        const flowDetails = await Flow.findOne({
            where: {
                FlowID
            },
            include: [{
                model: FlowDetails,
                as: 'Details',
            }]
        });
        const flowData = JSON.parse(JSON.stringify(flowDetails));
        let executionFlow = await ExecutionFlow.findOne({
            where: {
                FlowID: FlowID
            }
        })
        if (!executionFlow) {
            executionFlow = await ExecutionFlow.create({
                FlowID: FlowID,
                FlowName: flowData.FlowName,
                StartDate: FlowStarted,
                EndDate: null,
                Status: 'Execution Started',
                Version: flowData.Version,
                NodePositionDetails: flowData.FlowNodePositionDetails,
                NodeEdgesDetails: flowData.FlowNodeEdgesDetails,
                CreatedBy,
            }, { returning: true });
            const Istep = await flowData.Details.find(x => x.DetailsProperties.type == 'Start');
            await commonReUsableFlowExeecution(executionFlow, flowData, Istep?.ShapeID, null, FlowStarted);
        }
        res.status(200).send({ message: "Flow execution started successfully" });
    } catch (error) {
        console.log(error)
        logger.error({ details: error, logs })
        res.status(500).send({ message: error.message });
    }
}

exports.executedFlowAtScreen = async (req, res) => {
    try {
        const { screen_id } = req.body;
        const FlowStarted = new Date().toISOString();
        const Details = await FlowDetails.findOne({
            where: {
                DetailsProperties: {
                    screenId: screen_id
                }
            },
            attributes: ['FlowID']
        });
        if (!Details) {
            return res.status(200).send({ flow: null })
        }
        const flow = await Flow.findByPk(Details.FlowID, {
            include: [{ model: FlowDetails, as: 'Details', required: false }]
        });
        const flowData = JSON.parse(JSON.stringify(flow));
        const executionFlow = await ExecutionFlow.findOne({
            where: {
                FlowID: flow.FlowID
            }
        })
        if (!executionFlow) {
            return res.status(200).send({ flow: null })
        }
        await commonReUsableFlowExeecution(executionFlow, flowData, Details.ShapeID, Details.DetailsProperties.userId, FlowStarted);
        res.status(200).send({ message: "Flow execution started successfully" });
    } catch (error) {
        console.log(error)
        res.status(500).send({ message: error.message });
    }
}




exports.sendDyanmicEmail = dynamicSendEmail