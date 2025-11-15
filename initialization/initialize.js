const StaffUser = require("../models/Staffusers")
const { default: mongoose } = require("mongoose")
const Marketplace = require("../models/Marketplace")
const {marketdata} = require("./data")
const { grantItems } = require("./grantItems")


exports.initialize = async () => {

    const admin = await StaffUser.find({ auth: "superadmin"})
    .then(data => data)
    .catch(err => {
        console.log(`Error finding the admin data: ${err}`)
        return
    })

    if(admin.length <= 0 ){
        await StaffUser.create({ username: "battleroyaleadmin", password: "fxFWO2gY31R7", webtoken: "", status: "active", auth: "superadmin"})
        .catch(err => {
            console.log(`Error saving admin data: ${err}`)
            return
        }) 
    }

    const marketitems = await Marketplace.find()
    .then(data => data)
    .catch(err => {
        console.log(`Error finding marketplace items: ${err}`)
    })


    if (marketitems.length <= 0) {
        await Marketplace.insertMany(marketdata)
        .catch(err => {
            console.log(`Error creating marketplace items: ${err}`)
            return
        })
        console.log("Marketplace items initialized");
    }
    

    console.log("SERVER DATA INITIALIZED")
}

// Export grant functions for easy access
exports.grantItems = grantItems;