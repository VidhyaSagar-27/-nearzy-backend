"use strict";
const router=require("express").Router();
const auth=require("../middleware/auth");
const mongoose=require("mongoose");
const ticketSchema=new mongoose.Schema({user:{type:mongoose.Types.ObjectId,ref:"User"},subject:String,message:String,orderId:mongoose.Types.ObjectId,status:{type:String,default:"open"},reply:String,createdAt:{type:Date,default:Date.now}});
const Ticket=mongoose.models.Ticket||mongoose.model("Ticket",ticketSchema);
router.post("/tickets",auth,async(req,res)=>{try{const t=await Ticket.create({...req.body,user:req.user._id||req.user.id});res.status(201).json({success:true,ticket:t,message:"Support ticket created. We'll respond within 24 hours."});}catch(e){res.status(500).json({error:e.message});}});
router.get("/tickets",auth,async(req,res)=>{try{const tickets=await Ticket.find({user:req.user._id||req.user.id}).sort({createdAt:-1});res.json(tickets);}catch(e){res.status(500).json({error:e.message});}});
module.exports=router;