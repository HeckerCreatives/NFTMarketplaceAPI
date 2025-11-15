const routers = app => {
    console.log("Routers are all available");

    app.use("/auth", require("./auth"))
    app.use("/nft", require("./nft"))
    app.use("/marketplace", require("./marketplace"))
    app.use("/inventory", require("./inventory"))
}

module.exports = routers