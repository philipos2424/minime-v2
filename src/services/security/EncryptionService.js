const crypto = require('crypto');

class EncryptionService {
    constructor(masterKey) {
        if (!masterKey) throw new Error('Encryption key required');
        // Accept base64-encoded keys (from existing setup) or raw strings
        const keyBuffer = masterKey.length === 44 && masterKey.endsWith('=')
            ? Buffer.from(masterKey, 'base64')
            : Buffer.from(masterKey, 'utf8');
        // Derive a consistent 32-byte key
        this.key = crypto.scryptSync(keyBuffer, 'minime_salt_2026', 32);
        this.algorithm = 'aes-256-gcm';
    }

    encrypt(plaintext) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            cipher.setAAD(Buffer.from('minime', 'utf8'));

            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                version: 1
            };
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decrypt(encryptedData) {
        try {
            const { encrypted, iv, authTag } = encryptedData;
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.key,
                Buffer.from(iv, 'hex')
            );
            decipher.setAAD(Buffer.from('minime', 'utf8'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    hashToken(token) {
        return crypto.createHash('sha256').update(token).update(this.key).digest('hex');
    }

    generateSecureId() {
        return crypto.randomBytes(16).toString('hex');
    }

    generateReservationCode(prefix = 'MM') {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }
}

module.exports = EncryptionService;
