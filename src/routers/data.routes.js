const { Router } = require("express");
const { 
    addFlow, 
    getAllFlow, 
    addService, 
    getServiceList, 
    getServiceDetails,
    // addSettings,
    // getSettingDetails,
    addFlowDetails,
    getFlowDetails,
    getFlowByID,
    updateFlowEdgesAndPosition,
    addServiceElements,
    updateFlowDetailsConnections,
    updateFlowDetailsProperties,
    deleteFlow
} = require("../controller/data.controller");
const fs = require('fs');
const { sendEmails, executionHistory, executionRetry, executeFlow, executeStep, getRefreshData, emailResponse, formSubmit, getSharedData, webhookCallbacks, executedFlow, formApiCallBack, startFrowOnAppBuilderFormSubmit, executedFlowAtScreen } = require("../controller/execution.controller");
const multer = require("multer");
const { StepWiseDetails, getExecutionFlowHistory, copyExistWorkFlow, addAppBuilderFlow, getFlowDetailsData, getFlowDetailsDataByScreenID } = require("../controller/flow.controller");
const { updatePropsValidator } = require("../utils/validators/flow.validators");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = './publics/shared'; // Your desired directory
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true }); // Create the directory if it doesn't exist
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + '.' +file.originalname.split('.').pop();
        req.body[file.fieldname] = 'https://apiclykops-wf.projectzerozilla.com/file/' + filename
      cb(null, filename)
    }
  })
const upload = multer({storage: storage})

exports.dataRoutes = Router()
.post('/YMDwnk7WaOP8HZk',addFlow)
.post('/jnjx5juQ2dMifCx',getFlowByID)
.post('/vUhrqmonAflKTSF',updatePropsValidator,updateFlowEdgesAndPosition)
.post('/XOT0V5ZPYlIaCeP',getAllFlow)
.post('/iRtUeJy9rCTVg4i',deleteFlow)
.post('/LGHdL4xQ3gOGQtj',addService)
.post('/rQGOhFNjXSghrii',addServiceElements)
.post('/uhwOxbD50pTXAxR',getServiceList)
.post('/DXPVeS4KTsXIldn',getServiceDetails)
// .post('/Nn7tHmZhHgCICaW',addSettings)
// .post('/H9bG8y9ZsokMn9V',getSettingDetails)
.post('/mC2n5AkGGG06yBD',addFlowDetails)
.post('/KkJtsrAefv4YAzO',getFlowDetails)
.post('/FlY23ii0vDIITpZ',updateFlowDetailsConnections)
.post('/d1VoMyumqz9g8T9',updateFlowDetailsProperties)

.post('/KM49SYh7EWpxvzL',sendEmails)
.post('/qntvbtYmO6JBqLc',executionHistory)
.post('/BPbhDtKglJ8EFDj',executionRetry)
.post('/PK7jE3wcL0shkMi',executedFlow)
.post('/F9N9GN8bTU82XRr',executeStep)
.post('/TWwIzKLVCTS4BGU',getRefreshData)

.post('/JRQ4q5YKC79OoPu/:id/:shapeid',emailResponse)

.post('/AEDvXfmfJ9JgFVH',upload.any(),formSubmit)

.post('/Es0UlMhnH6ogUcd',getSharedData)
.post('/Zg5YScNcFY1s2lX/:FlowID/:ShapeID',webhookCallbacks)
.post('/Yy8GvNy2gEHD5pJ/:FlowID/:ShapeID/:UserID/:ExecutionFlowID',formApiCallBack)

.post('/DCwunW99pM1wl4l', StepWiseDetails)
.post('/n3PQUwhCFa67Vvs', getExecutionFlowHistory)

.post('/yjuCtkml3mgxbqM',copyExistWorkFlow)
.post('/xNTOseopjlbEayg',addAppBuilderFlow)
.post('/Uz6Nepg5FYItWdE',startFrowOnAppBuilderFormSubmit)
.post('/C4W1t7sKaSfzHVk',getFlowDetailsData)
.post('/H0Y3CDUKQXe2Oen',getFlowDetailsDataByScreenID)
.post('/Wis3g3WHbQoOgVr',executedFlowAtScreen);
