const functions = require("firebase-functions");

const app = require("express")();

const FBAuth = require("./util/fbAuth");

const cors = require("cors");
app.use(cors());

const { db } = require("./util/admin");

const {
	getAllBlinks,
	postOneBlink,
	getBlink,
	commentOnBlink,
	likeBlink,
	unlikeBlink,
	deleteBlink,
	deleteComment
} = require("./handlers/blinks");
const {
	signup,
	login,
	uploadImage,
	addUserDetails,
	getAuthenticatedUser,
	getUserDetails,
	markNotificationsRead
} = require("./handlers/users");

app.get("/blinks", getAllBlinks);
app.post("/blink", FBAuth, postOneBlink);
app.get("/blink/:blinkId", getBlink);
app.post("/blink/:blinkId/comment", FBAuth, commentOnBlink);
app.get("/blink/:blinkId/like", FBAuth, likeBlink);
app.get("/blink/:blinkId/unlike", FBAuth, unlikeBlink);
app.delete("/blink/:blinkId", FBAuth, deleteBlink);
app.delete("/blink/:blinkId/comment/:commentId", FBAuth, deleteComment);

app.post("/signup", signup);
app.post("/login", login);

app.post("/user/image", FBAuth, uploadImage);
app.post("/user", FBAuth, addUserDetails);
app.get("/user", FBAuth, getAuthenticatedUser);
app.get("/user/:username", getUserDetails);
app.post("/notifications", FBAuth, markNotificationsRead);

exports.api = functions.region("europe-west1").https.onRequest(app);

exports.createNotificationOnLike = functions
	.region("europe-west1")
	.firestore.document("likes/{id}")
	.onCreate(snapshot => {
		return db
			.doc(`/blinks/${snapshot.data().blinkId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().username !== snapshot.data().username) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().username,
						sender: snapshot.data().username,
						type: "like",
						read: false,
						blinkId: doc.id
					});
				}
			})
			.catch(err => {
				console.error(err);
			});
	});

exports.deleteNotificationOnUnlike = functions
	.region("europe-west1")
	.firestore.document("likes/{id}")
	.onDelete(snapshot => {
		return db
			.doc(`/notifications/${snapshot.id}`)
			.delete()
			.catch(err => {
				console.error(err);
			});
	});

exports.createNotificationOnComment = functions
	.region("europe-west1")
	.firestore.document("comments/{id}")
	.onCreate(snapshot => {
		return db
			.doc(`/blinks/${snapshot.data().blinkId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().username !== snapshot.data().username) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().username,
						sender: snapshot.data().username,
						type: "comment",
						read: false,
						blinkId: doc.id
					});
				}
			})
			.catch(err => {
				console.error(err);
			});
	});

exports.onUserImageChange = functions
	.region("europe-west1")
	.firestore.document("/users/{userId}")
	.onUpdate(change => {
		console.log(change.before.data());
		console.log(change.after.data());

		if (change.before.data().imageUrl !== change.after.data().imageUrl) {
			console.log("iamge has changed");
			const batch = db.batch();
			return db
				.collection("blinks")
				.where("username", "==", change.before.data().username)
				.get()
				.then(data => {
					data.forEach(doc => {
						const blink = db.doc(`/blinks/${doc.id}`);
						batch.update(blink, { userImage: change.after.data().imageUrl });
					});
					return batch.commit();
				});
		} else {
			return true;
		}
	});

exports.onBlinkDelete = functions
	.region("europe-west1")
	.firestore.document("/blinks/{blinkId}")
	.onDelete((snapshot, context) => {
		const blinkId = context.params.blinkId;
		const batch = db.batch();
		return db
			.collection("comments")
			.where("blinkId", "==", blinkId)
			.get()
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/comments/${doc.id}`));
				});
				return db
					.collection("likes")
					.where("blinkId", "==", blinkId)
					.get();
			})
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/likes/${doc.id}`));
				});
				return db
					.collection("notifications")
					.where("blinkId", "==", blinkId)
					.get();
			})
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/notifications/${doc.id}`));
				});
				return batch.commit();
			})
			.catch(err => {
				console.error(err);
			});
	});
