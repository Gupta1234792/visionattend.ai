let ioServer = null;

const setSocketServer = (io) => {
  ioServer = io;
};

const emitToCollegeRoom = (collegeId, roomId, event, payload) => {
  if (!ioServer || !collegeId || !roomId || !event) return;
  try {
    ioServer.of(`/college/${collegeId}`).to(roomId).emit(event, payload);
  } catch (error) {
    console.error("emitToCollegeRoom failed:", error?.message || error);
  }
};

module.exports = {
  setSocketServer,
  emitToCollegeRoom
};
