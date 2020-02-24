const { admin, db } = require("../util/admin");
const firebase = require("firebase");

const config = require("../util/config");
firebase.initializeApp(config);

const {
	validateSignupData,
	validateLoginData,
	reduceUserDetails
} = require("../util/validators");

exports.signup = (req, res) => {
	const newUser = {
		email: req.body.email,
		password: req.body.password,
		confirmPassword: req.body.confirmPassword,
		username: req.body.username
	};

	const { valid, errors } = validateSignupData(newUser);

	if (!valid) return res.status(400).json(errors);

	const noImg = "no-img.png";

	let token, userId;
	db.doc(`/users/${newUser.username}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				return res
					.status(400)
					.json({ username: "this username is already taken" });
			} else {
				return firebase
					.auth()
					.createUserWithEmailAndPassword(newUser.email, newUser.password);
			}
		})
		.then(data => {
			userId = data.user.uid;
			return data.user.getIdToken();
		})
		.then(idToken => {
			token = idToken;
			const userCredentials = {
				username: newUser.username,
				email: newUser.email,
				createdAt: new Date().toISOString(),
				imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
				userId
			};
			return db.doc(`/users/${newUser.username}`).set(userCredentials);
		})
		.then(() => {
			return res.status(201).json({ token });
		})
		.catch(err => {
			console.error(err);
			if (err.code === "auth/email-already-in-use") {
				return res.status(400).json({ email: "Email is already in use!" });
			} else {
				return res
					.status(500)
					.json({ general: "Something went wrong, please try again" });
			}
		});
};

exports.login = (req, res) => {
	const user = {
		email: req.body.email,
		password: req.body.password
	};

	const { valid, errors } = validateLoginData(user);

	if (!valid) return res.status(400).json(errors);

	firebase
		.auth()
		.signInWithEmailAndPassword(user.email, user.password)
		.then(data => {
			return data.user.getIdToken();
		})
		.then(token => {
			return res.json({ token });
		})
		.catch(err => {
			console.error(err);
			return res
				.status(403)
				.json({ general: "Wrong credentials, please try again" });
		});
};

exports.addUserDetails = (req, res) => {
	let userDetails = reduceUserDetails(req.body);

	db.doc(`/users/${req.user.username}`)
		.update(userDetails)
		.then(() => {
			return res.json({ message: "Details added successfully!" });
		})
		.catch(err => {
			console.log(err);
			return res.status(500).json({ error: err.code });
		});
};

exports.getUserDetails = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.params.username}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.user = doc.data();
				return db
					.collection("blinks")
					.where("username", "==", req.params.username)
					.orderBy("createdAt", "desc")
					.get();
			} else {
				return res.status(404).json({ error: "user not found!" });
			}
		})
		.then(data => {
			userData.blinks = [];
			data.forEach(doc => {
				userData.blinks.push({
					body: doc.data().body,
					createdAt: doc.data().createdAt,
					username: doc.data().username,
					userImage: doc.data().userImage,
					likeCount: doc.data().likeCount,
					commentCount: doc.data().commentCount,
					blinkId: doc.id
				});
			});
			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};

exports.getAuthenticatedUser = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.user.username}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data();
				return db
					.collection("likes")
					.where("username", "==", req.user.username)
					.get()
					.then(data => {
						userData.likes = [];
						data.forEach(doc => {
							userData.likes.push(doc.data());
						});
						return db
							.collection("notifications")
							.where("recipient", "==", req.user.username)
							.orderBy("createdAt", "desc")
							.limit(10)
							.get();
					})
					.then(data => {
						userData.notifications = [];
						console.log("uso vodje");

						data.forEach(doc => {
							userData.notifications.push({
								recipient: doc.data().recipient,
								sender: doc.data().sender,
								createdAt: doc.data().createdAt,
								blinkId: doc.data().blinkId,
								type: doc.data().type,
								read: doc.data().read,
								notificationId: doc.id
							});
						});
						return res.json(userData);
					})
					.catch(err => {
						console.error(err);
						return res.status(500).json({ error: err.code });
					});
			}
		});
};

exports.uploadImage = (req, res) => {
	const BusBoy = require("busboy");
	const path = require("path");
	const os = require("os");
	const fs = require("fs");

	const busboy = new BusBoy({ headers: req.headers });

	let imageFileName;
	let imageToBeUploaded = {};

	busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
		console.log(fieldname);
		console.log(filename);
		console.log(mimetype);

		if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
			return res.status(400).json({ error: "Wrong file type submitted" });
		}
		const imageExtension = filename.split(".")[filename.split(".").length - 1];
		imageFileName = `${Math.round(
			Math.random() * 1000000000000
		).toString()}.${imageExtension}`;
		const filepath = path.join(os.tmpdir(), imageFileName);
		imageToBeUploaded = { filepath, mimetype };
		file.pipe(fs.createWriteStream(filepath));
	});

	busboy.on("finish", () => {
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filepath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
				return db.doc(`/users/${req.user.username}`).update({ imageUrl });
			})
			.then(() => {
				return res.json({ message: "Image uploaded successfully!" });
			})
			.catch(err => {
				console.error(err);
				return res.status(500).json({ error: err.code });
			});
	});

	busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
	let batch = db.batch();
	req.body.forEach(notificationId => {
		const notification = db.doc(`/notifications/${notificationId}`);
		batch.update(notification, { read: true });
	});
	batch
		.commit()
		.then(() => {
			return res.json({ message: "notifications mark read" });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
