let ioServer = null;

const setSocketServer = (io) => {
  ioServer = io;
};

const getCollegeNamespace = (collegeId) => {
  if (!ioServer || !collegeId) return null;
  try {
    return ioServer.of(`/college/${collegeId}`);
  } catch {
    return null;
  }
};

const emitToCollegeRoom = (collegeId, roomId, event, payload) => {
  if (!collegeId || !roomId || !event) return;
  try {
    const namespace = getCollegeNamespace(collegeId);
    if (!namespace) return;
    namespace.to(roomId).emit(event, payload);
  } catch (error) {
    console.error("emitToCollegeRoom failed:", error?.message || error);
  }
};

const emitToUserRoom = (collegeId, userId, event, payload) => {
  if (!collegeId || !userId || !event) return;
  try {
    const namespace = getCollegeNamespace(collegeId);
    if (!namespace) return;
    namespace.to(`user_${userId}`).emit(event, payload);
  } catch (error) {
    console.error("emitToUserRoom failed:", error?.message || error);
  }
};

module.exports = {
  setSocketServer,
  emitToCollegeRoom,
  emitToUserRoom
};
