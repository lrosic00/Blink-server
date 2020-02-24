const { db } = require("../util/admin");

exports.getAllBlinks = (req, res) => {
	db.collection("blinks")
		.orderBy("createdAt", "desc")
		.get()
		.then(data => {
			let blinks = [];
			data.forEach(doc => {
				blinks.push({
					blinkId: doc.id,
					body: doc.data().body,
					username: doc.data().username,
					createdAt: doc.data().createdAt,
					commentCount: doc.data().commentCount,
					likeCount: doc.data().likeCount,
					userImage: doc.data().userImage
				});
			});
			return res.json(blinks);
		})
		.catch(err => console.error(err));
};

exports.postOneBlink = (req, res) => {
	if (req.body.body.trim() === "") {
		return res.status(400).json({ error: "Body must not be empty" });
	}

	const newBlink = {
		body: req.body.body,
		username: req.user.username,
		userImage: req.user.imageUrl,
		createdAt: new Date().toISOString(),
		likeCount: 0,
		commentCount: 0
	};

	db.collection("blinks")
		.add(newBlink)
		.then(doc => {
			const resBlink = newBlink;
			resBlink.blinkId = doc.id;
			res.json(resBlink);
		})
		.catch(err => {
			res.status(500).json({ error: "something went wrong" });
			console.error(err);
		});
};

exports.getBlink = (req, res) => {
	let blinkData = {};
	db.doc(`/blinks/${req.params.blinkId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Blink not foudn!" });
			}
			blinkData = doc.data();
			blinkData.blinkId = doc.id;
			return db
				.collection("comments")
				.orderBy("createdAt", "desc")
				.where("blinkId", "==", req.params.blinkId)
				.get();
		})
		.then(data => {
			blinkData.comments = [];
			data.forEach(doc => {
				let myObject = {
					blinkId: doc.data().blinkId,
					userImage: doc.data().userImage,
					body: doc.data().body,
					username: doc.data().username,
					createdAt: doc.data().createdAt,
					commentId: doc.id
				};
				blinkData.comments.push(myObject);
			});
			return res.json(blinkData);
		})
		.catch(err => {
			console.error(err);
			res.status(500).json({ error: err.code });
		});
};

// exports.getBlink = (req, res) => {
// 	let blinkData = {};
// 	db.doc(`/blinks/${req.params.blinkId}`)
// 		.get()
// 		.then(doc => {
// 			if (!doc.exists) {
// 				return res.status(404).json({ error: "Blink not foudn!" });
// 			}
// 			blinkData = doc.data();
// 			blinkData.blinkId = doc.id;
// 			return db
// 				.collection("comments")
// 				.orderBy("createdAt", "desc")
// 				.where("blinkId", "==", req.params.blinkId)
// 				.get();
// 		})
// 		.then(data => {
// 			blinkData.comments = [];
// 			data.forEach(doc => {
// 				blinkData.comments.push(doc.data());
// 			});
// 			return res.json(blinkData);
// 		})
// 		.catch(err => {
// 			console.error(err);
// 			res.status(500).json({ error: err.code });
// 		});
// };

exports.commentOnBlink = (req, res) => {
	if (req.body.body.trim() === "")
		return res.status(400).json({ comment: "must not be empty" });

	const newComment = {
		body: req.body.body,
		createdAt: new Date().toISOString(),
		blinkId: req.params.blinkId,
		username: req.user.username,
		userImage: req.user.imageUrl
	};
	db.doc(`blinks/${req.params.blinkId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Blink not found!" });
			}
			return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
		})
		.then(() => {
			return db.collection("comments").add(newComment);
		})
		.then(() => {
			res.json(newComment);
		})
		.catch(err => {
			console.log(err);
			res.status(500).json({ error: "Someting went wrong" });
		});
};

exports.likeBlink = (req, res) => {
	const likeDocument = db
		.collection("likes")
		.where("username", "==", req.user.username)
		.where("blinkId", "==", req.params.blinkId)
		.limit(1);

	const blinkDocument = db.doc(`/blinks/${req.params.blinkId}`);

	let blinkData;

	blinkDocument
		.get()
		.then(doc => {
			if (doc.exists) {
				blinkData = doc.data();
				blinkData.blinkId = doc.id;
				return likeDocument.get();
			} else {
				return res.status(404).json({ error: "blink not foud" });
			}
		})
		.then(data => {
			if (data.empty) {
				return db
					.collection("likes")
					.add({
						blinkId: req.params.blinkId,
						username: req.user.username
					})
					.then(() => {
						blinkData.likeCount++;
						return blinkDocument.update({ likeCount: blinkData.likeCount });
					})
					.then(() => {
						return res.json(blinkData);
					});
			} else {
				return res.status(400).json({ error: "Blink already liked!" });
			}
		})
		.catch(err => {
			console.error(err);
			res.status(500).json({ error: err.code });
		});
};

exports.unlikeBlink = (req, res) => {
	const likeDocument = db
		.collection("likes")
		.where("username", "==", req.user.username)
		.where("blinkId", "==", req.params.blinkId)
		.limit(1);

	const blinkDocument = db.doc(`/blinks/${req.params.blinkId}`);

	let blinkData;

	blinkDocument
		.get()
		.then(doc => {
			if (doc.exists) {
				blinkData = doc.data();
				blinkData.blinkId = doc.id;
				return likeDocument.get();
			} else {
				return res.status(404).json({ error: "blink not foud" });
			}
		})
		.then(data => {
			if (data.empty) {
				return res.status(400).json({ error: "Blink not liked!" });
			} else {
				return db
					.doc(`/likes/${data.docs[0].id}`)
					.delete()
					.then(() => {
						blinkData.likeCount--;
						return blinkDocument.update({ likeCount: blinkData.likeCount });
					})
					.then(() => {
						res.json(blinkData);
					});
			}
		})
		.catch(err => {
			console.error(err);
			res.status(500).json({ error: err.code });
		});
};

exports.deleteBlink = (req, res) => {
	const document = db.doc(`/blinks/${req.params.blinkId}`);
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Blink not found" });
			}
			if (doc.data().username !== req.user.username) {
				return res.status(403).json({ error: "Unauthorized" });
			} else {
				return document.delete();
			}
		})
		.then(() => {
			res.json({ message: "Blink deleted successfully" });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};

exports.deleteComment = (req, res) => {
	const document = db.doc(`/comments/${req.params.commentId}`);

	const blinkDoc = db.doc(`/blinks/${req.params.blinkId}`);

	let blinkData;

	blinkDoc.get().then(doc => {
		if (doc.exists) {
			blinkData = doc.data();
		} else {
			return res.status(404).json({ error: "Blink not found" });
		}
	});
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Comment not found" });
			}
			if (
				doc.data().blinkId !== req.params.blinkId ||
				doc.data().username !== req.user.username
			) {
				return res.status(403).json({ error: "Unauthorized" });
			} else {
				return (
					document.delete() &&
					blinkDoc.update({ commentCount: blinkData.commentCount - 1 })
				);
			}
		})

		.then(() => {
			res.json({ message: "Comment deleted successfully" });
		})
		.catch(err => console.log(err));
};
