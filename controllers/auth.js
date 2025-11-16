
const fs = require('fs')

const bcrypt = require('bcrypt');
const jsonwebtokenPromisified = require('jsonwebtoken-promisified');
const path = require("path");

const privateKey = fs.readFileSync(path.resolve(__dirname, "../keys/private-key.pem"), 'utf-8');
const { default: mongoose } = require("mongoose");
const Users = require('../models/Users');
const Staffusers = require('../models/Staffusers');
const Userdetails = require('../models/Userdetails');

const encrypt = async password => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

exports.authlogin = async(req, res) => {
    const { username, password } = req.query;

    Users.findOne({ username: { $regex: new RegExp('^' + username + '$', 'i') } })
    .then(async user => {
        if (user && (await user.matchPassword(password))){
            if (user.status != "active"){
                return res.status(401).json({ message: 'failed', data: `Your account had been ${user.status}! Please contact support for more details.` });
            }

            const token = await encrypt(privateKey)

            await Users.findByIdAndUpdate({_id: user._id}, {$set: {webtoken: token}}, { new: true })
            .then(async () => {
                const payload = { id: user._id, username: user.username, status: user.status, token: token, auth: "user" }

                let jwtoken = ""

                try {
                    jwtoken = await jsonwebtokenPromisified.sign(payload, privateKey, { algorithm: 'RS256' });
                } catch (error) {
                    console.error('Error signing token:', error.message);
                    return res.status(500).json({ error: 'Internal Server Error', data: "There's a problem signing in! Please contact customer support for more details! Error 004" });
                }

                res.cookie('sessionToken', jwtoken, { secure: true, sameSite: 'None' } )
                return res.json({message: "success", data: {
                    auth: "user"
                }})
            })
            .catch(err => res.status(400).json({ message: "bad-request2", data: "There's a problem with your account! There's a problem with your account! Please contact customer support for more details."  + err }))
        }
        else{

            await Staffusers.findOne({ username: { $regex: new RegExp('^' + username + '$', 'i') } })
            .then(async staffuser => {
                
                if (staffuser && (await staffuser.matchPassword(password))){
                    if (staffuser.status != "active"){
                        return res.status(401).json({ message: 'failed', data: `Your account had been ${staffuser.status}! Please contact support for more details.` });
                    }

                    const token = await encrypt(privateKey)

                    await Staffusers.findByIdAndUpdate({_id: staffuser._id}, {$set: {webtoken: token}}, { new: true })
                    .then(async () => {
                        const payload = { id: staffuser._id, username: staffuser.username, status: staffuser.status, token: token, auth: staffuser.auth }

                        let jwtoken = ""

                        try {
                            jwtoken = await jsonwebtokenPromisified.sign(payload, privateKey, { algorithm: 'RS256' });
                        } catch (error) {
                            console.error('Error signing token:', error.message);
                            return res.status(500).json({ error: 'Internal Server Error', data: "There's a problem signing in! Please contact customer support for more details! Error 004" });
                        }

                        res.cookie('sessionToken', jwtoken, { secure: true, sameSite: 'None' } )
                        return res.json({message: "success", data: {
                                auth: staffuser.auth
                            }
                        })
                    })
                    .catch(err => res.status(400).json({ message: "bad-request2", data: "There's a problem with your account! There's a problem with your account! Please contact customer support for more details."  + err }))
                }
                else{
                    return res.json({message: "failed", data: "Username/Password does not match! Please try again using the correct credentials!"})
                }
            })
            .catch(err => res.status(400).json({ message: "bad-request1", data: "There's a problem with your account! There's a problem with your account! Please contact customer support for more details." }))
        }
    })
    .catch(err => res.status(400).json({ message: "bad-request1", data: "There's a problem with your account! There's a problem with your account! Please contact customer support for more details." }))
}

exports.logout = async (req, res) => {
    res.clearCookie('sessionToken', { path: '/' })
    return res.json({message: "success"})
}

exports.register = async (req, res) => {
    const { username, password, email, firstname, lastname } = req.body;

    if(!username || !password){
        return res.status(400).json({ message: "bad-request", data: "Please provide a valid username and password!" })
    }

    if(username.length < 3 || password.length < 6){
        return res.status(400).json({ message: "bad-request", data: "Username must be at least 3 characters long and password must be at least 6 characters long!" })
    }

    await Users.create({ username: username, password: password, email: email, webtoken: "", bandate: "", banreason: "", status: "active" })
    .then(async data => {
        await Userdetails.create({ owner: data._id, firstname: firstname, lastname: lastname, profilepicture: "" })
        .then(async () => {
            return res.json({message: "success", data: "Account successfully created!"})
        })
        .catch(async err => {
            await Users.findByIdAndDelete(data._id)

            console.log(`Error creating userdetails: ${err}`)
            return res.status(400).json({ message: "bad-request", data: "There's a problem with your account! Please contact customer support for more details." })
        })

        return res.json({message: "success", data: "Account successfully created!"})
    })
    .catch(err => res.status(400).json({ message: "bad-request", data: "There's a problem with your account! Please contact customer support for more details." }))
}

exports.checkSession = async (req, res) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1];

    if (!token) {
        return res.status(401).json({ 
            message: 'Unauthorized', 
            data: "No active session found!" 
        });
    }

    try {
        const publicKey = fs.readFileSync(path.resolve(__dirname, "../keys/public-key.pem"), 'utf-8');
        const decodedToken = await jsonwebtokenPromisified.verify(token, publicKey, { algorithms: ['RS256'] });

        // Check if it's a user or staff account
        if (decodedToken.auth === "user") {
            const user = await Users.findById(decodedToken.id);

            if (!user) {
                return res.status(401).json({ 
                    message: 'Unauthorized', 
                    data: "User not found!" 
                });
            }

            if (user.status !== "active") {
                return res.status(401).json({ 
                    message: 'failed', 
                    data: `Your account has been ${user.status}! Please contact support for more details.` 
                });
            }

            if (decodedToken.token !== user.webtoken) {
                return res.status(401).json({ 
                    message: 'duallogin', 
                    data: "Your account has been opened on another device! You will now be logged out." 
                });
            }

            // Get user details
            const userDetails = await Userdetails.findOne({ owner: user._id });

            return res.json({
                message: "success",
                data: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    walletAddress: user.walletAddress,
                    status: user.status,
                    auth: "user",
                    firstname: userDetails?.firstname || "",
                    lastname: userDetails?.lastname || "",
                    profilepicture: userDetails?.profilepicture || ""
                }
            });

        } else {
            // Staff user
            const staffUser = await Staffusers.findById(decodedToken.id);

            if (!staffUser) {
                return res.status(401).json({ 
                    message: 'Unauthorized', 
                    data: "Staff user not found!" 
                });
            }

            if (staffUser.status !== "active") {
                return res.status(401).json({ 
                    message: 'failed', 
                    data: `Your account has been ${staffUser.status}! Please contact support for more details.` 
                });
            }

            if (decodedToken.token !== staffUser.webtoken) {
                return res.status(401).json({ 
                    message: 'duallogin', 
                    data: "Your account has been opened on another device! You will now be logged out." 
                });
            }

            return res.json({
                message: "success",
                data: {
                    id: staffUser._id,
                    username: staffUser.username,
                    status: staffUser.status,
                    auth: staffUser.auth
                }
            });
        }

    } catch (error) {
        console.error('Session verification error:', error);
        return res.status(401).json({ 
            message: 'Unauthorized', 
            data: "Invalid session!" 
        });
    }
}