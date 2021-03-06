"use strict";

importScripts('deps/crypto-js/build/rollups/tripledes.js',
              'deps/crypto-js/build/rollups/pbkdf1.js',
              'deps/crypto-js/build/rollups/pbkdf2.js');

var IniTech = function (html, contents, attachedFile, optData) {
    this.html = html || '';
    this.contents = this.peel(contents);
    this.attachedFile = attachedFile || '';
    this.optData = this.peel(optData);
};

IniTech.prototype = new Vendor('INISAFE Mail');
extend(IniTech.prototype, {
    init: function () {
        var S = this.unpack();

        this.recognize(S.company, {
            name: S.company,
            hint: S.keygen
        });

        this.checkArea = S.checkArea;
        this.dataArea = S.dataArea;

        this.hasher = {
            MD5: { helper: CryptoJS.MD5, algorithm: CryptoJS.algo.MD5 },
            SHA1: { helper: CryptoJS.SHA1, algorithm: CryptoJS.algo.SHA1 }
        }[S.hash];

        this.cipher = {
            DES: { helper: CryptoJS.DES, algorithm: CryptoJS.algo.DES },
            SEED: { helper: CryptoJS.SEED, algorithm: CryptoJS.algo.SEED }
        }[S.crypto[0]];

        this.mode = {
            CBC: CryptoJS.mode.CBC
        }[S.crypto[1]];

        this.padding = {
            PKCS5Padding: CryptoJS.pad.Pkcs7
        }[S.crypto[2]];

        if (S.keygen == 'INITECH') {
            this.iv = CryptoJS.enc.Latin1.parse(S.iv);
            this.salt = this.sender.salt;
            this.keygen = this.keygenINITECH;
        } else {
            if (S.version >= 'J 1.0.3') {
                this.iv = CryptoJS.enc.Base64.parse(S.iv);
                this.salt = this.iv.clone();
            } else {
                this.iv = CryptoJS.enc.Latin1.parse(S.iv);
                this.salt = CryptoJS.enc.Latin1.parse(this.sender.salt);
            }

            if (S.keygen == 'PBKDF1') {
                this.keygen = this.keygenPBKDF1;
            } else if (S.keygen == 'PBKDF2') {
                this.keygen = this.keygenPBKDF2;
            }
        }
    },

    supported_senders: {
        BC: {
            name: 'NH농협카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: '7',
            salt: 'nonghyup'
        },

        BO: {
            name: '신한은행',
            support: true,
            hint: '보안메일 비밀번호',
            keylen: '6,8',
            salt: 'shinhanbank'
        },

        CC: {
            name: 'BC카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7,
            salt: 'bccard',
        },

        KA: {
            name: 'Initech',
            support: true,
            hint: '보안메일 비밀번호',
            salt: 'consulting'
        },

        TC: {
            name: 'SKT',
            support: true,
            hint: '주민등록번호 앞 또는 뒤',
            keylen: '6,7',
            salt: 'SKT'
        },

        TH: {
            name: 'KT',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7,
            salt: 'ktbill'
        }
    },

    supported_fixers: {
        CC: {
            fix_frame: function (frame) {
                return frame.replace('id="objHeader"', '$& style="display:none"');
            }
        },

        TC: {
            ignore_replacer: true
        }
    },

    unpack: function () {
        var blob = this.blob(this.contents);
        var struct = {
            version: blob.read(9, true),
            count: parseInt(blob.read(1), 10),
            company: blob.read(2),
            crypto: blob.read(25, true).split('/'),
            hash: blob.read(20, true),
            iv: blob.read(30),
            keygen: blob.read(20, true),
            checkAreaLength: parseInt(blob.read(10), 10),
            dataAreaLength: parseInt(blob.read(10), 10)
        };
        struct.checkArea = CryptoJS.enc.Latin1.parse(blob.read(struct.checkAreaLength));
        struct.dataArea = CryptoJS.enc.Latin1.parse(blob.read(struct.dataAreaLength));
        return struct;
    },

    keygenINITECH: function (password) {
        var saltedKey1 = this.salt + '|' + password,
            hashedKey = CryptoJS.SHA1(CryptoJS.SHA1(CryptoJS.SHA1(saltedKey1))),
            saltedKey2 = this.salt + password + hashedKey.toString(CryptoJS.enc.Latin1);
        return this.hasher.helper(CryptoJS.enc.Latin1.parse(saltedKey2));
    },

    keygenPBKDF1: function (password) {
        return CryptoJS.PBKDF1(password, this.salt, {
            keySize: this.cipher.algorithm.keySize,
            hasher: this.hasher.algorithm,
            iterations: 5139
        });
    },

    keygenPBKDF2: function (password) {
        return CryptoJS.PBKDF2(password, this.salt, {
            keySize: this.cipher.algorithm.keySize,
            iterations: 5139
        });
    },

    decrypt: function (password) {
        var key = this.keygen(password);
        this.verify('Initech', key);

        return this.cipher.helper.decrypt(
            {
                ciphertext: this.dataArea
            },
            key,
            {
                iv: this.iv,
                mode: this.mode,
                padding: this.padding
            }
        );
    },

    verify: function (secret, key) {
        if (this.cipher.helper.decrypt(
            {
                ciphertext: this.checkArea
            },
            key,
            {
                iv: this.iv,
                mode: this.mode,
                padding: this.padding
            }
        ).toString(CryptoJS.enc.Latin1) != secret) {
            throw Error('다시 입력해보세요!');
        }
    },

    render_framed_message: function (frame, message) {
        if (this.fixer.ignore_replacer) {
            var offset = /(<!DOCTYPE|<html|<head|<body)/i.exec(message);
            if (offset) {
                //HACK: 일부 메일 앞쪽의 알 수 없는 (암호화 관련?) 문자열 제거.
                return message.slice(offset.index);
            } else {
                return message;
            }
        } else {
            return frame.replace(
                /id=['"]InitechSMMsgToReplace['"]>/,
                '>' + message.replace(/\$/g, '$$$$')
            );
        }
    }
});
