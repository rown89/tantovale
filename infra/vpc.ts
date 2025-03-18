export const vpc = new sst.aws.Vpc('Tantovale_Vpc', { bastion: true, nat: 'ec2' });
