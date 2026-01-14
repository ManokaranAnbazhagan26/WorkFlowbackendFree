const swaggerJSDoc = require('swagger-jsdoc');
const apiData = require('../../lib/swaggerSchema/api-data.json')

exports.swaggerSpec = swaggerJSDoc({
    swaggerDefinition: {
      "openapi": "3.0.0",
      "info": {
        "title": "FLOW DIAGRAM REST API",
        "version": "1.0.0",
        "description": "Flow Diagram Rest API Description"
      },
      "components": {
        "securitySchemes": {
          "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT"
          }
        }
      },
      "security": [
        {
          "bearerAuth": []
        }
      ],
      "paths": {
        ...apiData,
      }
    },
    apis: ['./src/routes/*.js'],
  })