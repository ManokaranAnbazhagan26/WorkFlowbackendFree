const { Op, literal } = require("sequelize");
const ExecutionFlow = require("../model/ExecutionFlow");
const ExecutionFlowSteps = require("../model/ExecutionFlowSteps");
const Flow = require("../model/Flow");
const SheduleNotification = require("../model/SheduleNotification");
const { sendDyanmicEmail } = require("./execution.controller");
const FlowDetails = require("../model/FlowDetails");

exports.flowNotification = async () => {
    try {

        const notifynData = await SheduleNotification.findAll({
            where: {
                ScheduleDateAndTime: {
                    [Op.between]: [new Date().toISOString(), new Date(new Date().getTime() + 30 * 60 * 1000).toISOString()]
                }
            }
        })
        for (const el of JSON.parse(JSON.stringify(notifynData))) {
            if (el.FlowID) {
                const flow = await ExecutionFlow.count({
                    where: {
                        FlowID: el.FlowID
                    }
                })
                if (!flow) {
                    sendDyanmicEmail({
                        EmailRecipient: el.Email,
                        EmailSubject: el.Subject,
                        BodyType: 'html',
                        MessageBody: el.NotificationContent,
                        CCEmails: [],
                        BCCEmails: []
                    })
                }
            } else {
                const step = await ExecutionFlowSteps.count({
                    where: {
                        ExecutionFlowID: el.ExecutionFlowID,
                        ShapeID: el.ShapeID
                    }
                })
                if (!step) {
                    sendDyanmicEmail({
                        EmailRecipient: el.Email,
                        EmailSubject: el.Subject,
                        BodyType: 'html',
                        MessageBody: el.NotificationContent,
                        CCEmails: [],
                        BCCEmails: []
                    })
                }
            }
        }
    } catch (error) {

    }
}
exports.StepWiseDetails = async (req, res) => {
    console.log(req.headers.origin, `${req.protocol}://${req.headers.host}`)
    try {
        const { ExecutionFlowID } = req.body;
        let flowTrueLength = 0;
        const flow = await ExecutionFlow.findByPk(ExecutionFlowID, {
            include: [{ model: ExecutionFlowSteps, as: 'Steps', required: false },
            { model: Flow, as: 'Flow', required: false, include: [{ model: FlowDetails, as: 'Details', required: false }] }]
        });
        const data = JSON.parse(JSON.stringify(flow));
        const steps = data?.Steps;
        const flowData = data?.Flow;
        const flowDetails = data?.Flow?.Details;
        const stepIdStatus = {}
        for await (const x of steps) {
            if (!Array.isArray(stepIdStatus[x.ShapeID])) {
                stepIdStatus[x.ShapeID] = []
            }
            stepIdStatus[x.ShapeID].push(x.StepStatus)
        }
        const getValidFlowPath = async (edg) => {
            const target = await flowData?.FlowNodeEdgesDetails.filter(x => x.source == edg.target);
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
        const startEdge = await flowData?.FlowNodeEdgesDetails.find(x => x.source.includes('start-'));
        await getValidFlowPath(startEdge)

        const flowDetailsData = {
            FlowName: flowData.FlowName,
            FlowDescription: flowData.FlowDescription,
            FlowStatus: data.Status,
            FlowCreationDate: flowData.CreatedDate,
            FlowTimeline: {
                StartDate: flowData.AccessStartDate,
                EndDate: flowData.AccessEndDate
            },
            FlowExecutionTimeline: {
                StartDate: data.StartDate,
                EndDate: data.EndDate
            },
            FlowCreatedBy: flowData.OwnerName,
            TotalSteps: 0,
            CompletedSteps: 0,
            IsFlowCompleted: data.Status == 'Completed' ? true : false,
        }
        for await (const [k, v] of Object.entries(stepIdStatus)) {
            if (v.every(x => x == 'Success')) {
                flowDetailsData['CompletedSteps'] += 1
            }
        }
        flowDetailsData['TotalSteps'] = data.Status == 'Completed' ? flowDetailsData['CompletedSteps'] : flowTrueLength
        const stepWiseData = {};
        let stepCount = 0;
        let IstSteps = null, stepNodeIds = new Set();
        if (flowData.Details.length > 2) {
            IstSteps = await flowData.Details.find(x => x.ShapeType == 'Start');

            const nextStepData = async (step) => {
                if (step.ShapeType != 'Start' && step.ShapeType != 'End') {
                    stepNodeIds.add(step.ShapeID);
                    stepCount++;
                    const stepsData = await steps.filter(x => x.ShapeID == step.ShapeID);
                    for await (const x of stepsData) {
                        if (!Array.isArray(stepWiseData[x.ShapeID])) {
                            stepWiseData[x.ShapeID] = [];
                        }
                        if (x.StepProperties.type == 'Create Form' || x.StepProperties.type == 'External Forms' && x.StepProperties?.owner?.length) {
                            const { UserFirstName, UserMiddleName, UserLastName } = x.StepProperties?.owner?.find(step => step.UserID == x.OwnerID);
                            let statusKey = x.StepStatus;
                            if (x?.StepValues) {
                                for await (const [k, v] of Object.entries(x?.StepValues)) {
                                    if (v?.includes('Approv') || v?.includes('Reject')) {
                                        statusKey = v;
                                    } else if (k == 'Skipped') {
                                        statusKey = k;
                                    } else {
                                        statusKey = 'Reviewed';
                                    }
                                }
                            }
                            stepWiseData[x.ShapeID].push({
                                Status: statusKey,
                                ExecutedBy: `${UserFirstName} ${UserMiddleName} ${UserLastName}`,
                                ExecutionStartDate: x.StepStartDate,
                                ExecutionEndDate: x.StepEndDate,
                                Name: x.StepName,
                                ShapeID: x.ShapeID,
                                Values: x.StepValues,
                            })
                        } else {
                            stepWiseData[x.ShapeID].push({
                                Status: x.StepStatus,
                                ExecutedBy: 'ClykOps Flow Server',
                                ExecutionStartDate: x.StepStartDate,
                                ExecutionEndDate: x.StepEndDate,
                                Name: x.StepName,
                                ShapeID: x.ShapeID,
                            })
                        }
                    }
                }
                const target = await flowData.FlowNodeEdgesDetails.filter(x => x.source == step.ShapeID);
                for await (const x of target) {
                    if (flowDetails.length > stepNodeIds.size && (!stepNodeIds.has(x.target)) && flowDetails.length > 2) {
                        const el = await flowDetails.find(step => step.ShapeID == x.target);
                        await nextStepData(el);
                    }
                }
            }
            if (IstSteps)
                await nextStepData(IstSteps);

        }
        res.status(200).send({ flowDetailsData, stepWiseData });
    } catch (error) {
        console.log(error)
        res.status(500).send(error.message);
    }
}
exports.getExecutionFlowHistory = async (req, res) => {
    try {
        const { FlowID } = req.body;
        const flow = await ExecutionFlow.findAll({
            where: {
                FlowID
            },
            include: [{ model: ExecutionFlowSteps, as: 'Steps', required: false },
            { model: Flow, as: 'Flow', required: false, include: [{ model: FlowDetails, as: 'Details', required: false }] }],
            order: [['StartDate', 'DESC']]
        });
        const flowData = JSON.parse(JSON.stringify(flow));
        for await (const el of flowData) {
            el.Flow.FlowNodePositionDetails = el.NodePositionDetails || [];
            el.Flow.FlowNodeEdgesDetails = el.NodeEdgesDetails || [];
            const positionDetails = JSON.parse(JSON.stringify(el.Flow.FlowNodePositionDetails));
            for await (const x of positionDetails) {
                const step = await el.Steps.find(z => z.ShapeID == x.id);
                if (step) {
                    const index = el.Flow.FlowNodePositionDetails.findIndex(z => z.id == step.ShapeID);
                    if (index !== -1) {
                        el.Flow.FlowNodePositionDetails[index].data.StepStatus = step?.StepStatus;
                    }
                }
            }
            const latestStatus = await el.Steps.find(step => step.StepStatus != 'Success' && step.StepStatus != 'Pending')
            const stepIdStatus = {}
            for await (const x of el.Steps) {
                if (!Array.isArray(stepIdStatus[x.ShapeID])) {
                    stepIdStatus[x.ShapeID] = []
                }
                stepIdStatus[x.ShapeID].push(x.StepStatus)
            }
            let flowTrueLength = 0;
            console.log(el.Flow?.FlowNodeEdgesDetails)
            const getValidFlowPath = async (edg) => {
                const target = await el.Flow?.FlowNodeEdgesDetails.filter(x => x.source == edg.target);
                for await (const z of target) {
                    if (z.target.includes('end-')) {
                        console.log(2, z)
                        return 'ok'
                    } else {
                        const trgt = await el.Steps.find(x => x.ShapeID == z.source);
                        if (z.source.includes('No') && trgt) {
                            flowTrueLength++;
                            console.log(31, z)
                            return await getValidFlowPath(z);
                        } else if (!z.source.includes('No')) {
                            flowTrueLength++;
                            console.log(32, z)
                            return await getValidFlowPath(z);
                        } else {
                            return 'ok'
                        }
                    }
                }
            }
            const startEdge = await el.Flow?.FlowNodeEdgesDetails.find(x => x.source.includes('start-'));
            await getValidFlowPath(startEdge)
            el['CompletedStepCount'] = 0
            for await (const [k, v] of Object.entries(stepIdStatus)) {
                if (v.every(x => x == 'Success')) {
                    el['CompletedStepCount'] += 1
                }
            }
            el['TotalSteps'] = el.Status == 'Completed' ? el['CompletedStepCount'] : flowTrueLength
            el['Status'] = el.Status == 'Completed' ? el.Status : latestStatus ? latestStatus.StepStatus : 'Faild';
            el['EndDate'] = el.EndDate ? el.EndDate : latestStatus ? null : el.Steps.reduce((max, item) =>
                new Date(item.StepEndDate) > new Date(max.StepEndDate) ? item : max
            ).StepEndDate;
        }
        res.status(200).send({ flow: flowData });

    } catch (error) {
        console.log(error)
        res.status(500).send(error.message);
    }
}
exports.copyExistWorkFlow = async (req, res) => {
    try {
        const { FlowID = null, FlowName,
            FlowDescription,
            FlowNodePositionDetails,
            FlowNodeEdgesDetails,
            AccessStartDate,
            AccessEndDate,
            IsAllowMultiUsers,
            ExecutionType,
            OwnerID,
            OwnerEmail,
            OwnerName,
            CreatedBy } = req.body;
        const flow = await Flow.findByPk(FlowID, {
            include: [{ model: FlowDetails, as: 'Details', required: false }]
        })
        const newFlow = await Flow.create({
            FlowName,
            FlowDescription,
            FlowNodePositionDetails: flow.FlowNodePositionDetails,
            FlowNodeEdgesDetails: flow.FlowNodeEdgesDetails,
            AccessStartDate,
            AccessEndDate,
            IsAllowMultiUsers,
            ExecutionType,
            StartNodeID: flow.StartNodeID,
            OwnerID,
            OwnerEmail,
            OwnerName,
            CreatedBy,
            Version: 1,
            CreatedDate: literal('CURRENT_TIMESTAMP'),
        });

        const bulkDetailsData = []
        for await (const detail of flow.Details) {
            bulkDetailsData.push({
                ServiceID: detail.ServiceID,
                StepNumber: detail.StepNumber,
                FlowID: newFlow.FlowID,
                ShapeID: detail.ShapeID,
                Title: detail.Title,
                DetailsProperties: detail.DetailsProperties,
                CreatedBy,
                CreatedDate: literal('CURRENT_TIMESTAMP'),
            })
        }
        await FlowDetails.bulkCreate(bulkDetailsData);

        res.status(201).send({ message: 'Flow Copied Successfully' });

    } catch (error) {
        console.log(error)
        res.status.send(error.message);
    }
}
exports.addAppBuilderFlow = async (req, res) => {
    try {
        const { FlowName,
            CreatedBy } = req.body;

        const [flow, created] = await Flow.findOrCreate({
            where: {
                FlowName: 'workflow_' + FlowName
            },
            defaults: {
                FlowName: 'workflow_' + FlowName,
                FlowDescription: 'workflow_description_' + FlowName,
                IsAllowMultiUsers: true,
                ExecutionType: 'multiple',
                CreatedBy,
                CreatedDate: literal('CURRENT_TIMESTAMP'),
            }
        });
        res.status(201).send({ message: created ? 'Flow Created Successfully' : 'Flow Already Created', flow });
    } catch (error) {
        console.log(error)
        res.status(500).send(error.message);
    }
}

exports.getFlowDetailsData = async (req, res) => {
    try {
        const { FlowID } = req.body;
        const flow = await Flow.findByPk(FlowID, {
            include: [{ model: FlowDetails, as: 'Details', required: false }]
        });
        res.status(200).send({ flow });
    } catch (error) {
        console.log(error)
        res.status(500).send(error.message);
    }
}
exports.getFlowDetailsDataByScreenID = async (req, res) => {
    try {
        const { screen_id } = req.body;
        const Details = await FlowDetails.findOne({
            where: {
                DetailsProperties: {
                    screenId: screen_id
                }
            },
            attributes: ['FlowID']
        });
        if (!Details) {
            return res.status(200).send({ flow:null })
        }
        const flow = await Flow.findByPk(Details.FlowID, {
            include: [{ model: FlowDetails, as: 'Details', required: false }]
        });
        res.status(200).send({ flow });
    } catch (error) {
        console.log(error)
        res.status(200).send({flow:null});
    }
}