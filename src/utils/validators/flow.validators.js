exports.updatePropsValidator = async (req, res, next) => {
    function isValidURL(str) {
        const pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
            '((([a-zA-Z0-9$-_@.&+!*\\(\\),]|%[0-9a-fA-F]{2})+)' + // domain name
            '(\\.[a-zA-Z]{2,})+)' + // extension
            '(\\:[0-9]{2,5})?' + // port
            '(\\/.*)?$', 'i'); // path
        return pattern.test(str);
    }
    const { NodeConfigs, FlowNodeEdgesDetails, FlowNodePositionDetails } = req.body;
    if (FlowNodePositionDetails.length > 1) {
        for await (const el of FlowNodePositionDetails) {
            if (!FlowNodeEdgesDetails.some((item) => item.source === el.id || item.target === el.id)) {
                return res.status(400).json({ message: 'Please provide connection between steps' });
            }
        }
    }

    if (NodeConfigs) {
        for await (const [k, v] of Object.entries(NodeConfigs)) {
            if (!v.title) {
                return res.status(400).json({ message: 'Please provide title some of the step' });
            }
            // if (!v.ServiceID) {
            //     return res.status(400).json({ message: 'Please provide service id some of the step' });
            // }
            if (v.type == 'Create Form') {
                if (!v.form?.length) {
                    return res.status(400).json({ message: 'Please provide form details on step ' + v.title });
                }
                if (!v.owner.length) {
                    return res.status(400).json({ message: 'Please provide owner on step ' + v.title });
                }
                if (!v.startDate) {
                    return res.status(400).json({ message: 'Please provide start date on step ' + v.title });
                }
                for await (const el of v.form) {
                    if (!el?.label) {
                        return res.status(400).json({ message: 'Please provide some of form label on step ' + v.title });
                    }
                }
            }
            if (v.type == 'Gmail') {
                if (!v.EmailRecipient) {
                    return res.status(400).json({ message: 'Please provide email recipient on step ' + v.title });
                }
                if (!v.EmailRecipient.match(/\{([^}]+)\}/g) && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.EmailRecipient))) {
                    return res.status(400).json({ message: 'Please provide valid email/field link  on step' + v.title });
                }
                if (!v.EmailSubject) {
                    return res.status(400).json({ message: 'Please provide subject on step' + v.title });
                }
                if (!v.MessageBody) {
                    return res.status(400).json({ message: 'Please provide message body on step' + v.title });
                }
            }
            if (v.type == 'If Else Clause') {
                if (!v?.rows?.length) {
                    return res.status(400).json({ message: 'Please provide conditions on step ' + v.title });
                }
                for await (const el of v.rows) {
                    if (!el?.value1) {
                        return res.status(400).json({ message: 'Please provide some of first value on step ' + v.title });
                    }
                    if (!el?.value2) {
                        return res.status(400).json({ message: 'Please provide some of second value on step ' + v.title });
                    }
                }
            }
            if (v.type == 'External Forms') {
                if (!v.linkUrl) {
                    return res.status(400).json({ message: 'Please provide link url on step ' + v.title });
                }
                if (!isValidURL(v.linkUrl)) {
                    return res.status(400).json({ message: 'Please provide valid link url on step ' + v.title });
                }
                if (!v.owner.length) {
                    return res.status(400).json({ message: 'Please provide owner on step ' + v.title });
                }
                if (!v.startDate) {
                    return res.status(400).json({ message: 'Please provide start date on step ' + v.title });
                }
            }
            if (v.type == 'Concatenation' || v.type == 'Remove HTML') {
                if (!v.value) {
                    return res.status(400).json({ message: 'Please provide some value on step ' + v.title });
                }

            }
            if (v.type == 'Find' || v.type == 'Split' || v.type == 'Replace') {
                if (!v.value) {
                    return res.status(400).json({ message: 'Please provide value on step ' + v.title });
                }
                if (!v.position) {
                    return res.status(400).json({ message: 'Please provide position on step ' + v.title });
                }
                if (v.type == 'Replace' && !v.withValue) {
                    return res.status(400).json({ message: 'Please provide replace value with on step ' + v.title });
                }
            }
        }
    }
    next();
}