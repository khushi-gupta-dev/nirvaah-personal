const crypto = require("crypto");
const mongoose = require("mongoose");
const service = require("./adminPriorityModuleService");

const lockSchema = new mongoose.Schema(
  {
    _id: String,
    owner: String,
    lockedUntil: Date,
    nextRunAt: Date,
  },
  { versionKey: false },
);
const SchedulerLock =
  mongoose.models.SchedulerLock ||
  mongoose.model("SchedulerLock", lockSchema, "scheduler_locks");

const owner = crypto.randomUUID();
const LOCK_LEASE_MS = 2 * 60 * 1000;
const LOCK_REFRESH_MS = 30 * 1000;
let started = false;

const acquireLock = async (name, intervalMs) => {
  const now = new Date();
  try {
    const lock = await SchedulerLock.findOneAndUpdate(
      {
        _id: name,
        lockedUntil: { $lte: now },
        nextRunAt: { $lte: now },
      },
      {
        $set: {
          owner,
          lockedUntil: new Date(now.getTime() + LOCK_LEASE_MS),
          nextRunAt: new Date(now.getTime() + intervalMs),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
    return lock?.owner === owner;
  } catch (error) {
    // A duplicate _id means another instance owns the current lease.
    if (error.code === 11000) return false;
    throw error;
  }
};

const runWithLock = async (name, intervalMs, task) => {
  let acquired;
  try {
    acquired = await acquireLock(name, intervalMs);
  } catch (error) {
    console.error(`Scheduler could not acquire ${name} lock:`, error.message);
    return;
  }
  if (!acquired) return;

  let refreshing = false;
  let ownershipLost = false;
  const heartbeat = setInterval(async () => {
    if (refreshing || ownershipLost) return;
    refreshing = true;
    try {
      const result = await SchedulerLock.updateOne(
        { _id: name, owner },
        { $set: { lockedUntil: new Date(Date.now() + LOCK_LEASE_MS) } },
      );
      if (result.matchedCount !== 1) {
        ownershipLost = true;
        console.error(`Scheduler lost the ${name} lock while the task was running.`);
      }
    } catch (error) {
      console.error(`Scheduler could not renew the ${name} lock:`, error.message);
    } finally {
      refreshing = false;
    }
  }, LOCK_REFRESH_MS);

  try {
    await task();
  } catch (error) {
    console.error(`Scheduled task ${name} failed:`, error.message);
  } finally {
    clearInterval(heartbeat);
    try {
      await SchedulerLock.updateOne(
        { _id: name, owner },
        { $set: { lockedUntil: new Date(0) } },
      );
    } catch (error) {
      console.error(`Scheduler could not release the ${name} lock:`, error.message);
    }
  }
};

exports.start = () => {
  if (started) return;
  started = true;

  setInterval(
    () => runWithLock("priority-escalation", 10 * 60 * 1000, service.runEscalation),
    10 * 60 * 1000,
  );

  setInterval(
    () => runWithLock("priority-deadline-alerts", 30 * 60 * 1000, service.sendDeadlineAlerts),
    30 * 60 * 1000,
  );
};
