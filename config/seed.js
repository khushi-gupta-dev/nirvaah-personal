/**
 * Database Seed Script
 * Creates demo admin + citizen user accounts for testing
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Complaint = require('../models/Complaint');

const connectDB = require('./db');

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding database...');

  // Clear existing data
  await Admin.deleteMany({});
  await User.deleteMany({});
  await Complaint.deleteMany({});
  console.log('✅ Cleared existing data');

  // Create admin user
  const admin = await Admin.create({
    name: 'NIRVAAH Admin',
    email: 'admin@nirvaah.com',
    password: 'admin123',
    isActive: true,
    wardNo:10
  });
  console.log('✅ Admin created:', admin.email);

  // Create citizen users
  const citizens = await User.create([
    { name: 'Rahul Kumar', email: 'citizen@nirvaah.com', password: 'pass123', points: 120, complaintsCount: 4, resolvedCount: 2 },
    { name: 'Priya Sharma', email: 'priya@nirvaah.com', password: 'pass123', points: 85, complaintsCount: 3, resolvedCount: 1 },
    { name: 'Amit Singh', email: 'amit@nirvaah.com', password: 'pass123', points: 60, complaintsCount: 2, resolvedCount: 1 }
  ]);
  console.log(`✅ ${citizens.length} citizens created`);

  // Create sample complaints with geolocation
  const sampleComplaints = [
    {
      title: 'Large pothole on MG Road',
      description: 'Deep pothole near the bus stop causing accidents daily. Multiple bikes have been damaged.',
      category: 'pothole',
      status: 'pending',
      priority: 'high',
      location: { type: 'Point', coordinates: [77.5946, 12.9716], address: 'MG Road, Bangalore', landmark: 'Near Garuda Mall' },
      user: citizens[0]._id,
      voteCount: 12,
      votes: [citizens[1]._id, citizens[2]._id],
      priorityScore: 36
    },
    {
      title: 'Overflowing garbage bins near park',
      description: 'Municipal bins have not been cleared for 4 days. Causing health hazards and bad smell.',
      category: 'garbage',
      status: 'in_progress',
      priority: 'medium',
      location: { type: 'Point', coordinates: [77.5947, 12.9720], address: 'Cubbon Park Area, Bangalore', landmark: 'Cubbon Park Gate 2' },
      user: citizens[1]._id,
      voteCount: 8,
      priorityScore: 26
    },
    {
      title: 'Water pipeline burst on 5th Main',
      description: 'Water leaking onto road creating a pool. Been leaking for 2 days. Risk of road damage.',
      category: 'water_leakage',
      status: 'resolved',
      priority: 'critical',
      location: { type: 'Point', coordinates: [77.5900, 12.9680], address: '5th Main, HSR Layout, Bangalore' },
      user: citizens[2]._id,
      voteCount: 25,
      priorityScore: 75,
      resolvedAt: new Date()
    },
    {
      title: 'Street lights not working on Hosur Road',
      description: 'No street lights for 300m stretch creating safety issues at night.',
      category: 'street_light',
      status: 'pending',
      priority: 'high',
      location: { type: 'Point', coordinates: [77.6100, 12.9200], address: 'Hosur Road, Electronic City' },
      user: citizens[0]._id,
      voteCount: 18,
      priorityScore: 50
    }
  ];

  for (const comp of sampleComplaints) {
    await Complaint.create({
      ...comp,
      statusHistory: [{ status: comp.status, changedByModel: 'Admin', changedBy: admin._id, note: 'Status set during seeding' }]
    });
  }
  console.log(`✅ ${sampleComplaints.length} sample complaints created`);
  console.log('\n🎉 Seeding complete!\n');
  console.log('Login credentials:');
  console.log('  Admin:   admin@nirvaah.com / admin123');
  console.log('  Citizen: citizen@nirvaah.com / pass123');

  process.exit(0);
};

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
