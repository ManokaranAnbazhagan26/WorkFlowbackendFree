const { literal, Op } = require("sequelize");
const Flow = require("../model/Flow");
const FlowServices = require("../model/FlowServices");
const FlowDetails = require("../model/FlowDetails");
const FlowServiceElements = require("../model/FlowServiceElements");
const { sequelize } = require("../model");
const SheduleNotification = require("../model/SheduleNotification");
const ExecutionFlowSteps = require("../model/ExecutionFlowSteps");
// const { generatePasswordHash } = require("../utils/encription/pashwordHash");
// const Users = require("../model/Users");
// const License = require("../model/License");

exports.addFlow = async (req, res) => {
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
        if (FlowID) {
            await Flow.update({
                FlowName,
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
                ModifiedBy: CreatedBy,
                Version: literal('"Version" + 1'),
                ModifiedDate: literal('CURRENT_TIMESTAMP')
            }, { where: { FlowID } });
            if (OwnerID) {
                const NotificationContent = `<div>
                            <div style="text-transform: capitalize;">Hi ${OwnerName},</div>
                            <p>Please Check That <b>${FlowName}</b> Flow is not executed , untill this is the last day</p>
                            <P>So Please Execute If nessasry else ignoor the mail</P>
                            <p>Thank you</p>
                            <p>Team</p>
                        </div>`
                await SheduleNotification.update({
                    Subject: 'Flow Is Not Started',
                    ScheduleDateAndTime: AccessEndDate,
                    NotificationContent
                }, { where: { FlowID } })
            }
            return res.status(201).send("Flow updated successfully");

        } else {
            const flow = await Flow.create({
                FlowName,
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
                CreatedBy,
                Version: 1
            }, { returning: true });
            if (OwnerID) {
                const NotificationContent = `<div>
                            <div style="text-transform: capitalize;">Hi ${OwnerName},</div>
                            <p>Please Check That <b>${FlowName}</b> Flow is not executed , untill this is the last day</p>
                            <P>So Please Execute If nessasry else ignoor the mail</P>
                            <p>Thank you</p>
                            <p>Team</p>
                        </div>`
                await SheduleNotification.bulkCreate([{
                    FlowID: flow.FlowID,
                    Email: OwnerEmail,
                    Subject: 'Flow Is Not Started',
                    ScheduleDateAndTime: AccessEndDate,
                    NotificationContent
                }], { ignoreDuplicates: true })
            }
        }
        res.status(201).send(`Flow ${FlowID ? 'updated' : 'added'} successfully`);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

exports.updateFlowEdgesAndPosition = async (req, res) => {
    await ExecutionFlowSteps.sync();
    const t = await sequelize.transaction();
    try {
        const { FlowID, FlowNodeEdgesDetails, FlowNodePositionDetails, NodeConfigs, StartNodeID, CreatedBy } = req.body;
        const startNodStatus = await Object.keys(NodeConfigs).some(key => key == StartNodeID);
        const updatedEdges = await FlowNodeEdgesDetails.filter(node => Object.keys(NodeConfigs).some(key => key == node.source) || Object.keys(NodeConfigs).some(key => key == node.target));
        await Flow.update({ FlowNodeEdgesDetails: updatedEdges, FlowNodePositionDetails, StartNodeID: startNodStatus ? StartNodeID : null,
            Version: literal('"Version" + 1')
         },
            { where: { FlowID } }, { transaction: t });

        for await (const [k, v] of Object.entries(NodeConfigs)) {
            if (!FlowNodePositionDetails.some((item) => item.id == k)) {
                delete NodeConfigs[k]
            }
        }
        const nodeIds = []
        for await (const el of FlowNodePositionDetails) {
            nodeIds.push(el.id)
        }
        await FlowDetails.destroy({
            where: {
                FlowID,
                ShapeID: { [Op.notIn]: nodeIds }
            }
        })
        if (NodeConfigs) {
            for await (const [k, v] of Object.entries(NodeConfigs)) {
                const details = await FlowDetails.findOne({
                    where: {
                        FlowID,
                        ShapeID: k
                    }
                }, { transaction: t });
                let step = 0
                for (let i = 0; i < FlowNodePositionDetails.length; i++) {
                    if (FlowNodePositionDetails[i].id == k)
                        step = i + 1
                }
                if (details) {
                    await FlowDetails.update({
                        DetailsProperties: v,
                        StepNumber: step,
                        Title: v.title,
                        ShapeType: v?.type || null
                    }, {
                        where: {
                            FlowID,
                            ShapeID: k
                        }
                    }, { transaction: t })
                } else {
                    await FlowDetails.create({
                        ServiceID: v.ServiceID,
                        StepNumber: step,
                        FlowID,
                        ShapeID: k,
                        Title: v.title,
                        ShapeType: v.type,
                        DetailsProperties: v,
                        CreatedBy
                    }, { transaction: t })
                }
            }
        }
        await t.commit();
        res.status(201).send("Flow updated successfully");
    } catch (error) {
        await t.rollback();
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

exports.getFlowByID = async (req, res) => {
    const { FlowID } = req.body;
    try {
        const flow = await Flow.findOne({
            where: {
                IsDeleted: false,
                FlowID
            },
            include: {
                model: FlowDetails,
                as: 'Details',
                where: {
                    IsDeleted: false
                },
                include: {
                    model: FlowServiceElements,
                    as: 'ServiceElements',
                    where: {
                        IsDeleted: false
                    },
                    attributes: ['ServiceElementName']
                },
                required: false,
                attributes: {
                    exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                }
            },
            attributes: {
                include: [[literal(`(
                    SELECT COUNT(*) FROM "FlowDetails"
                        WHERE "FlowDetails"."FlowID" = "Flow"."FlowID"
                            AND "FlowDetails"."IsDeleted" = false
                )`), 'NosOfSteps']]
            }
        });
        res.status(200).send(flow);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}
exports.getAllFlow = async (req, res) => {
    try {
        const { UserID = null } = req.body;
        let where = sequelize.literal(`"Details"."IsDeleted" = false`)

        if (UserID) {
            where = sequelize.literal(`
                JSON_CONTAINS("Details"."DetailsProperties", '{
                "UserID": "${UserID}"
                 }', '$.owner')`
            );
        }
        const flow = await Flow.findAll({
            where: {
                IsDeleted: false
            },
            attributes: {
                include: [[literal(`(
                    SELECT COUNT(*) FROM "FlowDetails"
                        WHERE "FlowDetails"."FlowID" = "Flow"."FlowID"
                            AND "FlowDetails"."IsDeleted" = false
                            AND "FlowDetails"."ShapeType" NOT IN ('Start', 'End','Yes','No')
                )`), 'NosOfSteps'],
                [literal(`(
                    SELECT COUNT(*) > 0 FROM "ExecutionFlows"
                        WHERE "ExecutionFlows"."FlowID" = "Flow"."FlowID"
                            AND "ExecutionFlows"."IsDeleted" = false
                )`), 'IsFlowStarted']]
            },
            include: {
                model: FlowDetails,
                as: 'Details',
                where: where,
                include: {
                    model: FlowServiceElements,
                    as: 'ServiceElements',
                    where: {
                        IsDeleted: false
                    },
                    attributes: ['ServiceElementName']
                },
                required: false,
                attributes: {
                    exclude: ['IsDeleted', 'CreatedDate', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                }
            },
            order: [
                ['CreatedDate', 'DESC']
            ],
        });
        res.status(200).send(flow);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

exports.deleteFlow = async (req, res) => {
    try {
        const { FlowID, DeletedBy } = req.body;
        const count = await FlowDetails.count({ where: { FlowID } });
        if (count > 0) {
            await Flow.update({
                IsDeleted: true,
                DeletedBy,
                DeletedDate: literal('CURRENT_TIMESTAMP')
            }, { where: { FlowID } });
        } else {
            await Flow.destroy({ where: { FlowID } });
        }
        res.status(200).send("Flow deleted successfully");
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}
exports.addService = async (req, res) => {
    try {
        const {
            ServiceName,
            ServiceType,
            ServiceDescription,
            ServiceProperties,
            CreatedBy
        } = req.body;
        await FlowServices.create({
            ServiceName,
            ServiceType,
            ServiceDescription,
            ServiceProperties,
            CreatedBy
        });
        res.status(201).send("Service added successfully");
    } catch (err) {
        res.status(400).send({
            error: err.errors?.[0]?.message
                ? err.errors?.[0]?.message
                : err.message,
        });
    }
}
exports.addServiceElements = async (req, res) => {
    const { ServiceID,
        ServiceElementName,
        ServiceDescription,
        ServiceElementProperties,
        CreatedBy } = req.body;
    try {
        await FlowServiceElements.create({
            ServiceID,
            ServiceElementName,
            ServiceDescription,
            ServiceElementProperties,
            CreatedBy
        })
        res.status(201).send("Service Element added successfully");
    } catch (error) {
        res.status(400).send({
            error: err.errors?.[0]?.message
                ? err.errors?.[0]?.message
                : err.message,
        });
    }
}
exports.getServiceList = async (req, res) => {
    try {
        await FlowServiceElements.sync()
        const services = await FlowServices.findAll({
            where: {
                IsDeleted: false
            },
            include: {
                model: FlowServiceElements,
                as: 'ServiceElements',
                where: {
                    IsDeleted: false
                },
                required: false,
                attributes: {
                    exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
                }
            },
            attributes: {
                exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
            }
        });
        res.status(200).send(services);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

exports.getServiceDetails = async (req, res) => {
    try {
        const { ServiceID } = req.body;
        const service = await FlowServices.findOne({
            where: {
                ServiceID,
                IsDeleted: false
            },
            attributes: {
                exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
            }
        });
        res.status(200).send(service);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

// exports.addSettings = async (req, res) => {
//     try {
//         const {
//             ServiceID,
//             SettingName,
//             SettingValue,
//             CreatedBy
//         } = req.body;
//         await FlowServices.create({
//             ServiceID,
//             SettingName,
//             SettingValue,
//             CreatedBy
//         });
//         res.status(201).send("Settings added successfully");
//     } catch (err) {
//         res.status(400).send({
//             error: err.errors?.[0]?.message
//                 ? err.errors?.[0]?.message
//                 : err.message,
//         });
//     }
// }

// exports.getSettingDetails = async (req, res) => {
//     try {
//         const { ServiceID } = req.body;
//         const setting = await FlowServices.findOne({
//             where: {
//                 ServiceID,
//                 IsDeleted: false
//             },
//             attributes: {
//                 exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
//             }
//         });
//         res.status(200).send(setting);
//     } catch (error) {
//         res.status(400).send({
//             error: error.errors?.[0]?.message
//                 ? error.errors?.[0]?.message
//                 : error.message,
//         });
//     }
// }

exports.addFlowDetails = async (req, res) => {
    try {
        const {
            FlowID,
            ServiceID,
            StepNumber,
            DetailsProperties,
            DetailsPosition,
            SourceDetailsID,
            DestinaionDetailsID,
            FlowNodePositionDetails,
            CreatedBy
        } = req.body;
        await FlowDetails.create({
            FlowID,
            ServiceID,
            StepNumber,
            DetailsProperties,
            DetailsPosition,
            SourceDetailsID,
            DestinaionDetailsID,
            CreatedBy
        });
        await Flow.update({
            FlowNodePositionDetails,
            Version: literal('"Version" + 1'),
        }, {
            where: {
                FlowID
            }
        });
        res.status(201).send("Flow Details added successfully");
    } catch (err) {
        res.status(400).send({
            error: err.errors?.[0]?.message
                ? err.errors?.[0]?.message
                : err.message,
        });
    }
}
exports.getFlowDetails = async (req, res) => {
    try {
        const { FlowID, ServiceID } = req.body;
        const flowDetails = await FlowDetails.findAll({
            where: {
                FlowID,
                ServiceID,
                IsDeleted: false
            },
            attributes: {
                exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
            }
        });
        res.status(200).send(flowDetails);
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

exports.updateFlowDetailsConnections = async (req, res) => {
    try {
        const { FlowID } = req.body;
        const flowDetails = await Flow.findByPk(FlowID, {
            include: [{
                model: FlowDetails,
                as: 'Details',
                where: {
                    IsDeleted: false
                },
                required: false
            }]
        })
        if (!flowDetails) {
            return res.status(404).send({ error: 'Flow not found' });
        }
        console.log(JSON.parse(JSON.stringify(flowDetails)))
        res.status(200).send({ flowDetails: flowDetails });

    } catch (error) {
        res.status(500).send({
            error: error.message
        });
    }
}
exports.updateFlowDetailsProperties = async (req, res) => {
    try {
        const { DetailsProperties, FlowDetailID } = req.body;
        await FlowDetails.update({
            DetailsProperties
        }, {
            where: {
                FlowDetailID
            }
        })
        res.status(200).send({ message: 'Properties Update Successfully' })
    } catch (error) {
        res.status(400).send({
            error: error.errors?.[0]?.message
                ? error.errors?.[0]?.message
                : error.message,
        });
    }
}

// exports.addUser = async (req, res) => {
//     try {
//         const { CurrentUserID = null } = req.payload;
//         const {
//             UserFirstName,
//             UserMiddleName,
//             UserLastName,
//             UserEmail,
//             UserPassword,
//             UserPhone,
//             UserPhoto,
//             UserType,
//             LicenseID
//         } = req.body;
//         await Users.sync()
//         await Users.create({
//             UserFirstName,
//             UserMiddleName,
//             UserLastName,
//             UserEmail,
//             UserPassword: generatePasswordHash(UserPassword),
//             UserPhone,
//             UserPhoto,
//             UserType,
//             LicenseID,
//             CreatedBy: CurrentUserID
//         });
//         res.status(201).send("User added successfully");
//     } catch (err) {
//         res.status(400).send({
//             error: err.errors?.[0]?.message
//                 ? err.errors?.[0]?.message
//                 : err.message,
//         });
//     }
// }

// exports.getUserList = async (req, res) => {
//     try {
//         const { LicenseID = null, CurrentUserType } = req.payload;
//         const { UserType = "User" } = req.body;
//         const whereCondition = {
//             IsDeleted: false,
//             UserType
//         }
//         if (CurrentUserType != 'SuperAdmin') {
//             whereCondition.LicenseID = LicenseID
//         }
//         const users = await Users.findAll({
//             where: whereCondition,
//             attributes: {
//                 exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate', 'DeletedBy', 'DeletedDate']
//             }
//         });
//         res.status(200).send(users);
//     } catch (error) {
//         res.status(400).send({
//             error: error.errors?.[0]?.message
//                 ? error.errors?.[0]?.message
//                 : error.message,
//         });
//     }
// }
// exports.addLicense = async (req, res) => {
//     try {
//         const {
//             LicenseName,
//             ServiceIDs,
//             AllowNosOfAdminUsers,
//             AllowNosOfUsers,
//             AllowNosOfManagerUsers,
//             StartDate,
//             ExpireDate,
//         } = req.body;
//         await License.create({
//             LicenseName,
//             ServiceIDs,
//             AllowNosOfAdminUsers,
//             AllowNosOfUsers,
//             AllowNosOfManagerUsers,
//             StartDate,
//             ExpireDate,
//             CreatedBy
//         });
//         res.status(201).send("License added successfully");
//     } catch (err) {
//         res.status(400).send({
//             error: err.errors?.[0]?.message
//                 ? err.errors?.[0]?.message
//                 : err.message,
//         });
//     }
// }

// exports.getLicenseList = async (req, res) => {
//     try {
//         const licenses = await License.findAll({
//             where: {
//                 IsDeleted: false
//             },
//             attributes: {
//                 exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate']
//             }
//         });
//         res.status(200).send(licenses);
//     } catch (error) {
//         res.status(400).send({
//             error: error.errors?.[0]?.message
//                 ? error.errors?.[0]?.message
//                 : error.message,
//         });
//     }
// }

// exports.getLicenseDetails = async (req, res) => {
//     try {
//         const { LicenseID } = req.body;
//         const license = await License.findOne({
//             where: {
//                 LicenseID,
//                 IsDeleted: false
//             },
//             attributes: {
//                 exclude: ['IsDeleted', 'CreatedAt', 'CreatedBy', 'ModifiedBy', 'ModifiedDate']
//             }
//         });
//         res.status(200).send(license);
//     } catch (error) {
//         res.status(400).send({
//             error: error.errors?.[0]?.message
//                 ? error.errors?.[0]?.message
//                 : error.message,
//         });
//     }
// }
